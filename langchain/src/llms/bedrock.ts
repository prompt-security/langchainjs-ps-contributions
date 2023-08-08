import { getEnvironmentVariable } from "../util/env.js";
import { LLM, BaseLLMParams } from "./base.js";

type Dict = { [key: string]: any };

class LLMInputOutputAdapter {
  /** Adapter class to prepare the inputs from Langchain to a format
  that LLM model expects. Also, provides a helper function to extract
  the generated text from the model response. */

  static prepareInput(provider: string, prompt: string): Dict {
    const inputBody: Dict = {};

    if (provider === "anthropic" || provider === "ai21") {
      inputBody.prompt = prompt;
    } else if (provider === "amazon") {
      inputBody.inputText = prompt;
      inputBody.textGenerationConfig = {};
    } else {
      inputBody.inputText = prompt;
    }

    if (provider === "anthropic" && !("max_tokens_to_sample" in inputBody)) {
      inputBody.max_tokens_to_sample = 50;
    }

    return inputBody;
  }

  static prepareOutput(provider: string, responseBody: any): string {
    if (provider === "anthropic") {
      return responseBody.completion;
    } else if (provider === "ai21") {
      return responseBody.completions[0].data.text;
    }
    return responseBody.results[0].outputText;
  }
}

/** Bedrock models.
    To authenticate, the AWS client uses the following methods to automatically load credentials:
    https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html
    If a specific credential profile should be used, you must pass the name of the profile from the ~/.aws/credentials file that is to be used.
    Make sure the credentials / roles used have the required policies to access the Bedrock service.
*/
export interface BedrockInput {
  /** Model to use.
      For example, "amazon.titan-tg1-large", this is equivalent to the modelId property in the list-foundation-models api.
  */
  model: string;

  /** The AWS region e.g. `us-west-2`.
      Fallback to AWS_DEFAULT_REGION env variable or region specified in ~/.aws/config in case it is not provided here.
  */
  regionName?: string;

  /** Temperature */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;
}

export class Bedrock extends LLM implements BedrockInput {
  model = "amazon.titan-tg1-large";

  regionName?: string | undefined = undefined;

  temperature?: number | undefined = undefined;

  maxTokens?: number | undefined = undefined;

  get lc_secrets(): { [key: string]: string } | undefined {
    return {};
  }

  _llmType() {
    return "bedrock";
  }

  constructor(fields?: Partial<BedrockInput> & BaseLLMParams) {
    super(fields ?? {});

    this.model = fields?.model ?? this.model;
    const allowedModels = ["ai21", "anthropic", "amazon"];
    if (!allowedModels.includes(this.model.split(".")[0])) {
      throw new Error(
        `Unknown model: '${this.model}', only these are supported: ${allowedModels}`
      );
    }
    this.regionName =
      fields?.regionName ?? getEnvironmentVariable("AWS_DEFAULT_REGION");
    this.temperature = fields?.temperature ?? this.temperature;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
  }

  /** Call out to Bedrock service model.
    Arguments:
      prompt: The prompt to pass into the model.

    Returns:
      The string generated by the model.

    Example:
      response = model.call("Tell me a joke.")
  */
  async _call(prompt: string): Promise<string> {
    const { createSignedFetcher } = await Bedrock.imports();

    const signedFetcher = createSignedFetcher({
      service: "bedrock",
      region: this.regionName,
    });

    const url = `https://bedrock.${this.regionName}.amazonaws.com/model/${this.model}/invoke`;
    const provider = this.model.split(".")[0];
    const inputBody = LLMInputOutputAdapter.prepareInput(provider, prompt);

    const response = await this.caller.call(
      async () =>
        await signedFetcher(url, {
          method: "post",
          body: JSON.stringify(inputBody),
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
          },
        })
    );

    if (response.status < 200 || response.status >= 300) {
      throw Error(
        `Failed to access underlying url '${url}': got ${response.status} ${
          response.statusText
        }: ${await response.text()}`
      );
    }
    const responseJson = await response.json();
    const text = LLMInputOutputAdapter.prepareOutput(provider, responseJson);
    return text;
  }

  /** @ignore */
  static async imports(): Promise<{ createSignedFetcher: any }> {
    try {
      const { createSignedFetcher } = await import("aws-sigv4-fetch");
      return { createSignedFetcher };
    } catch (e) {
      throw new Error(
        "Please install a dependency for bedrock with, e.g. `yarn add aws-sigv4-fetch`"
      );
    }
  }
}
