export type ReviewPoint = {
  id: string;
  title: string;
  evidence: string | null;
  expectedAction: string;
  blocking: boolean;
  requiresAcknowledgement: boolean;
};

export type ProposalReviewInput = {
  kind: string;
  content: string;
  companyPhone?: string | null;
  companyCertifications?: string | null;
  leadSource?: string | null;
};

export type ReviewDecision = {
  blockers: ReviewPoint[];
  missingAcknowledgements: ReviewPoint[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sentenceAt(content: string, index: number) {
  const sentence = content.split(/(?<=[.!?\n])\s+/).find((part) => {
    const start = content.indexOf(part);
    return index >= start && index < start + part.length;
  });
  return sentence?.trim().slice(0, 300) ?? content.slice(Math.max(0, index - 100), index + 200).trim();
}

function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0033")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("33") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isPublicSource(value: string | null | undefined) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const octets = host.split(".").map(Number);
      if (octets.some((octet) => octet > 255) || octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || octets[0] >= 224) return false;
      if (octets[0] === 169 && octets[1] === 254) return false;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
      if (octets[0] === 192 && octets[1] === 168) return false;
    }
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
    return true;
  } catch {
    return false;
  }
}

export function reviewProposal(input: ProposalReviewInput): ReviewPoint[] {
  const points: ReviewPoint[] = [];
  const certification = /\b(?:certifi\w*|certification\w*|RGE|Qualibat|QualiPAC|QualiPV|Qualiopi)\b/i.exec(input.content);
  if (certification) {
    const evidence = sentenceAt(input.content, certification.index);
    const normalizedEvidence = normalize(evidence);
    const negativeCertification = /\b(?:non|pas)\s+certifi\w*/i.test(normalizedEvidence);
    const namedLabels = evidence.match(/\b(?:RGE|Qualibat|QualiPAC|QualiPV|Qualiopi)\b/gi) ?? [];
    const profileLabels = normalize(input.companyCertifications ?? "");
    const supported = Boolean(profileLabels.trim()) && (namedLabels.length === 0 || namedLabels.every((label) => profileLabels.includes(normalize(label))));
    if (!negativeCertification) {
      if (!supported) {
        points.push({
          id: "certification_unsupported",
          title: "Certification non étayée par le profil",
          evidence,
          expectedAction: "Retirez cette mention ou vérifiez puis ajoutez la certification exacte au profil de l’entreprise.",
          blocking: true,
          requiresAcknowledgement: false,
        });
      } else {
        points.push({
          id: "certification_human_check",
          title: "Certification à confirmer par vous",
          evidence,
          expectedAction: "Vérifiez que la certification du profil est toujours valide et autorise cette formulation.",
          blocking: false,
          requiresAcknowledgement: true,
        });
      }
    }
  }

  const pricePattern = /\b(?:prix|tarif|tarifs|co[uû]t|à partir de)\b/i;
  const priceClaim = pricePattern.exec(input.content);
  if (priceClaim) {
    const evidence = sentenceAt(input.content, priceClaim.index);
    const hasAmount = /(?:\d+(?:[,.]\d{1,2})?\s*(?:€|euros?)|€\s*\d+(?:[,.]\d{1,2})?)/i.test(evidence);
    const statesQuote = /\b(?:sur devis|devis personnalise|prix sur demande)\b/i.test(normalize(evidence));
    if (!hasAmount && !statesQuote) {
      points.push({
        id: "price_not_specified",
        title: "Prix évoqué sans montant vérifiable",
        evidence,
        expectedAction: "Ajoutez un montant vérifié, indiquez qu’il est établi sur devis, ou justifiez pourquoi aucun montant n’est nécessaire.",
        blocking: false,
        requiresAcknowledgement: true,
      });
    }
  }

  const phonePattern = /(?:\+33|0033|0)[1-9](?:[ .-]?\d{2}){4}\b/g;
  const contentPhones = [...input.content.matchAll(phonePattern)];
  if (contentPhones.length > 0) {
    const expectedPhone = phoneDigits(input.companyPhone ?? "");
    const mismatches = contentPhones.filter((match) => !expectedPhone || phoneDigits(match[0]) !== expectedPhone);
    if (mismatches.length > 0) {
      points.push({
        id: "phone_mismatch",
        title: "Téléphone différent du profil ou profil non renseigné",
        evidence: [...new Set(mismatches.map((match) => sentenceAt(input.content, match.index ?? 0)))].join(" … "),
        expectedAction: "Corrigez chaque numéro divergent ou mettez à jour le profil pour qu’ils correspondent. Ce contrôle ne confirme pas que le profil est à jour.",
        blocking: true,
        requiresAcknowledgement: false,
      });
    } else {
      points.push({
        id: "phone_profile_match",
        title: "Téléphone conforme au profil, actualité à confirmer",
        evidence: [...new Set(contentPhones.map((match) => sentenceAt(input.content, match.index ?? 0)))].join(" … "),
        expectedAction: "Vérifiez que le numéro du profil est toujours le bon numéro professionnel à publier.",
        blocking: false,
        requiresAcknowledgement: true,
      });
    }
  }

  if (input.kind === "prospect" && !isPublicSource(input.leadSource)) {
    points.push({
      id: "prospect_source_missing",
      title: "Source publique du prospect manquante ou invalide",
      evidence: input.content.trim().slice(0, 300) || null,
      expectedAction: "Ajoutez une URL HTTP(S) et vérifiez qu’elle correspond réellement à l’organisation. Pepito ne contrôle pas le contenu de cette source.",
      blocking: true,
      requiresAcknowledgement: false,
    });
  }

  return points;
}

export function reviewPublishedSiteHtml(html: string, companyPhone?: string | null, companyCertifications?: string | null) {
  const visibleText = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:#[\da-f]+|\w+);/gi, " ");
  return reviewProposal({ kind: "site_web_content", content: visibleText, companyPhone, companyCertifications });
}

export function decideProposalReview(points: ReviewPoint[], acknowledgedIds: string[] = []): ReviewDecision {
  const acknowledged = new Set(acknowledgedIds);
  return {
    blockers: points.filter((point) => point.blocking),
    missingAcknowledgements: points.filter((point) => point.requiresAcknowledgement && !acknowledged.has(point.id)),
  };
}