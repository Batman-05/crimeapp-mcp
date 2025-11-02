export type SecretBinding = {
	get(name?: string): Promise<string | undefined>;
};

export type MaybeSecretBinding = string | SecretBinding | undefined;

/**
 * Resolves a secret binding to its string value.
 * If the binding is a string, it is returned as-is.
 * If it is a SecretBinding, its get() method is called.
 * If it is undefined, undefined is returned.
 */
export async function resolveSecret(binding: MaybeSecretBinding) {
	if (!binding) return undefined;
	if (typeof binding === "string") return binding;
	if (typeof binding === "object" && "get" in binding && typeof binding.get === "function") {
		return binding.get();
	}
	return undefined;
}
