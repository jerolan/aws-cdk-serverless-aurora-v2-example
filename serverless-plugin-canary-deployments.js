"use strict";

const AWS_PROVIDER_NAME = "aws";
const DEFAULT_NAME = "live";
const DEFAULT_VERSION = "$LATEST";

module.exports = class ServerlessPluginCanaryDeployments {
  #serverless;

  constructor(serverless) {
    this.#serverless = serverless;
    this.provider = serverless.getProvider(AWS_PROVIDER_NAME);
    this.hooks = {
      "aws:package:finalize:mergeCustomProviderResources":
        this.#addLambdaAliases.bind(this),
      "lazy-version-apply:apply": this.#lazyVersionApply.bind(this),
    };
    this.commands = {
      "lazy-version-apply": {
        usage: "Update Lambda function alias to the latest deployed version",
        lifecycleEvents: ["apply"],
      },
    };
  }

  async #addLambdaAliases() {
    const template =
      this.#serverless.service.provider.compiledCloudFormationTemplate;
    const functionKeys = Object.keys(this.#serverless.service.functions);

    for (const functionKey of functionKeys) {
      const $function = this.#serverless.service.functions[functionKey];
      const functionLogicalId =
        this.provider.naming.getLambdaLogicalId(functionKey);

      const aliasLogicalId = `${functionLogicalId}Alias`;

      let aliasResource = {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: functionLogicalId },
          FunctionVersion: DEFAULT_VERSION,
          Name: DEFAULT_NAME,
        },
      };

      try {
        // TODO: implement exponential backoff
        const response = await this.provider.request(
          "Lambda",
          "listVersionsByFunction",
          {
            FunctionName: $function.name,
          }
        );

        const versions = response.Versions;
        const currentVersion = versions[versions.length - 1];

        aliasResource = {
          Type: "AWS::Lambda::Alias",
          Properties: {
            FunctionName: { Ref: functionLogicalId },
            FunctionVersion: currentVersion.Version,
            Name: DEFAULT_NAME,
            Description: `Alias for ${functionKey}`,
          },
        };
      } catch {
        // do-nothing
      } finally {
        template.Resources[aliasLogicalId] = aliasResource;
      }

      this.#replaceFunctionReferencesWithAlias(template, functionLogicalId);
    }
  }

  async #lazyVersionApply() {
    const functionKeys = Object.keys(this.#serverless.service.functions);

    for (const functionKey of functionKeys) {
      const $function = this.#serverless.service.functions[functionKey];

      // TODO: implement exponential backoff
      const response = await this.provider.request(
        "Lambda",
        "listVersionsByFunction",
        {
          FunctionName: $function.name,
        }
      );

      const versions = response.Versions;
      const latestVersion = versions[versions.length - 1];
      await this.provider.request("Lambda", "updateAlias", {
        FunctionName: $function.name,
        Name: DEFAULT_NAME,
        FunctionVersion: latestVersion.Version,
      });
    }
  }

  #replaceFunctionReferencesWithAlias(template, functionLogicalId) {
    const replaceReferences = (obj) => {
      if (typeof obj !== "object" || obj == null) {
        return;
      }

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (key === "Fn::GetAtt" && obj[key][0] === functionLogicalId) {
            // Replace 'GetAtt' reference with alias
            obj[key] = {
              "Fn::Join": [
                ":",
                [{ "Fn::GetAtt": [functionLogicalId, "Arn"] }, DEFAULT_NAME],
              ],
            };
          } else if (typeof obj[key] === "object") {
            replaceReferences(obj[key]); // Recursive call for nested objects and arrays
          }
        }
      }
    };

    replaceReferences(template);
  }
};
