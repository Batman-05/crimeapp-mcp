export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = {
	role: ChatRole;
	content: string;
};
export type ChatCompletionsBody = {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	max_tokens?: number;
};
