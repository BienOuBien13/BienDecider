/** Refus d'exécution affichable tel quel au dirigeant, avec le code HTTP à renvoyer. */
export class PublishRefusedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
