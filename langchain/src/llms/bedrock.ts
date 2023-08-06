// TODO: review this code before commit!
import { getEnvironmentVariable } from "../util/env.js";
import { LLM, BaseLLMParams } from "./base.js";

/** Bedrock models.
    To authenticate, the AWS client uses the following methods to automatically load credentials:
    https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html
    If a specific credential profile should be used, you must pass the name of the profile from the ~/.aws/credentials file that is to be used.
    Make sure the credentials / roles used have the required policies to access the Bedrock service.
    TODO:: should I also extend extends BaseLLMParams like most others, except only hf that doesn't extend from BaseLLMParams?
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

  /** The name of the profile in the ~/.aws/credentials or ~/.aws/config files.
      The name must have either access keys or role information specified.
      If not specified, the default credential profile or, if on an EC2 instance,
      credentials from IMDS will be used.
      Fallback to BEDROCK_CREDENTIALS_PROFILE_NAME env variable or region specified in ~/.aws/config in case it is not provided here.
      See: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html
  */
  credentialsProfileName?: string;

  /** Temperature */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;
}

export class Bedrock extends LLM implements BedrockInput {
  model = "bedrock";

  regionName?: string | undefined = undefined;

  credentialsProfileName?: string | undefined = undefined;

  temperature?: number | undefined = undefined;

  maxTokens?: number | undefined = undefined;

  get lc_secrets(): { [key: string]: string } | undefined {
    return {
      credentialsProfileName: "BEDROCK_CREDENTIALS_PROFILE_NAME",
    };
  }

  _llmType() {
    return "bedrock";
  }

  constructor(fields?: Partial<BedrockInput> & BaseLLMParams) {
    super(fields ?? {});

    this.model = fields?.model ?? this.model;
    this.regionName =
      fields?.regionName ?? getEnvironmentVariable("AWS_DEFAULT_REGION");
    this.credentialsProfileName =
      fields?.credentialsProfileName ??
      getEnvironmentVariable("BEDROCK_CREDENTIALS_PROFILE_NAME");
    this.temperature = fields?.temperature ?? this.temperature;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;

    // Verify credentialsProfileName is configured
    if (!this.credentialsProfileName) {
      throw new Error(
        "Please set a credentials profile name for Bedrock in the environment variable BEDROCK_CREDENTIALS_PROFILE_NAME or in the credentialsProfileName field of the Bedrock constructor."
      );
    }
  }

  /** @ignore */
  async _call(
    prompt: string /* TODO:: remove or use?,
    options: this["ParsedCallOptions"] */
  ): Promise<string> {
    const { createSignedFetcher } = await Bedrock.imports();

    const signedFetcher = createSignedFetcher({
      service: "bedrock",
      region: this.regionName,
    });

    const url = `https://bedrock.${this.regionName}.amazonaws.com/model/${this.model}/invoke`;

    const requestBody = {
      inputText: prompt,
      textGenerationConfig: {
        temperature: this.temperature,
        maxTokenCount: this.maxTokens,
        stopSequences: [], // TODO: add to config?
      },
    };

    const response = await signedFetcher(url, {
      method: "post",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
        accept: "/",
      },
    });

    // TODO: handle errors? try/catch?
    const res = await response.json();
    return res;
  }

  /** @ignore */
  static async imports(): Promise<{ createSignedFetcher: any }> {
    // todo: Promise<typeof import("@huggingface/inference")>
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
