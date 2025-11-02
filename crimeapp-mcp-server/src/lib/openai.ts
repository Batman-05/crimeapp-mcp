import type { ChatCompletionsBody, ChatMessage } from "./types";

/*
	Calls the OpenAI Chat Completions API with the given parameters.
	Returns the generated response text.
*/ 

export type ChatRequest = {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
};

export async function callOpenAiChat(
	apiKey: string,
	{ model, messages, temperature, maxTokens }: ChatRequest,
	timeoutMs = 45000,
) {
	const body: ChatCompletionsBody = {
		model,
		messages,
		...(temperature !== undefined ? { temperature } : {}),
		...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
	};

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;

	try {
		response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`OpenAI API request timed out after ${timeoutMs}ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
	}

	const data: {
		choices?: Array<{ message?: { content?: string } }>;
	} = await response.json();

	const messageContent = data.choices?.[0]?.message?.content?.trim();

	if (!messageContent) {
		throw new Error("OpenAI API returned an empty response.");
	}

	return messageContent;
}
