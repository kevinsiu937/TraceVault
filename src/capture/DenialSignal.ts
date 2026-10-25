export class DenialSignal {
  isDenial(message: string): boolean {
    return /denied|permission|rejected|not allowed|blocked/i.test(message);
  }
}
