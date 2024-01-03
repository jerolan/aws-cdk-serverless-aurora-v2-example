"use strict";

const AWS_PROVIDER_NAME = "aws";
const DEFAULT_ALIAS_NAME = "live";

module.exports = class ServerlessPluginCanaryDeployments {
  #serverless;
  #options;

  constructor(serverless, options) {
    this.#serverless = serverless;
    this.#options = options;
    this.provider = serverless.getProvider(AWS_PROVIDER_NAME);
    this.hooks = {
      "aws:package:finalize:mergeCustomProviderResources":
        this.addLambdaAliases.bind(this),
    };
  }

  addLambdaAliases() {
    const template =
      this.#serverless.service.provider.compiledCloudFormationTemplate;
    const functions = this.#serverless.service.getAllFunctions();

    functions.forEach((functionName) => {
      const functionLogicalId =
        this.provider.naming.getLambdaLogicalId(functionName);
      const aliasLogicalId = `${functionLogicalId}Alias`;

      const aliasResource = {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: functionLogicalId },
          FunctionVersion: { "Fn::GetAtt": [functionLogicalId, "Version"] },
          Name: DEFAULT_ALIAS_NAME,
        },
      };

      template.Resources[aliasLogicalId] = aliasResource;
    });
  }
};
