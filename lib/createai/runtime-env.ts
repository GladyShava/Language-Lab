interface CreateAIRuntimeBindings {
  CREATEAI_SERVICE_TOKEN?: string;
  CREATEAI_BASE_URL?: string;
  CREATEAI_VOICE?: string;
}

let runtimeBindings: CreateAIRuntimeBindings = {};

export function setCreateAIRuntimeBindings(bindings: CreateAIRuntimeBindings): void {
  runtimeBindings = bindings;
}

export function getCreateAIConfig(): { token: string; baseUrl: string; voice: string } {
  const token = runtimeBindings.CREATEAI_SERVICE_TOKEN ?? process.env.CREATEAI_SERVICE_TOKEN ?? "";
  const baseUrl = runtimeBindings.CREATEAI_BASE_URL ?? process.env.CREATEAI_BASE_URL ?? "https://api-main.aiml.asu.edu";
  const voice = runtimeBindings.CREATEAI_VOICE ?? process.env.CREATEAI_VOICE ?? "nova";
  return { token, baseUrl: baseUrl.replace(/\/$/, ""), voice };
}
