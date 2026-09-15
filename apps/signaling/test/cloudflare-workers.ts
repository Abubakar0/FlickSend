export abstract class DurableObject<Environment = unknown> {
  protected readonly ctx: DurableObjectState;
  protected readonly env: Environment;

  constructor(ctx: DurableObjectState, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}
