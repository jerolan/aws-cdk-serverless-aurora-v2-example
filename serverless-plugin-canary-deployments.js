"use strict";

// Constantes para el nombre del proveedor de AWS y los valores predeterminados
const AWS_PROVIDER_NAME = "aws";
const DEFAULT_NAME = "live";
const DEFAULT_VERSION = "$LATEST";

// Clase principal del plugin Serverless para Canary Deployments
module.exports = class ServerlessPluginCanaryDeployments {
  #serverless; // Instancia privada de serverless

  constructor(serverless) {
    this.#serverless = serverless;
    this.provider = serverless.getProvider(AWS_PROVIDER_NAME);
    this.hooks = {
      // Hooks para integrarse con el ciclo de vida de Serverless
      "aws:package:finalize:mergeCustomProviderResources":
        this.#addLambdaAliases.bind(this),
      "lazy-version-apply:apply": this.#lazyVersionApply.bind(this),
    };
    this.commands = {
      // Comandos personalizados para aplicar versiones de funciones Lambda
      "lazy-version-apply": {
        usage: "Update Lambda function alias to the latest deployed version",
        lifecycleEvents: ["apply"],
      },
    };
  }

  // Método para agregar alias de Lambda en las funciones
  async #addLambdaAliases() {
    const template =
      this.#serverless.service.provider.compiledCloudFormationTemplate;
    const functionKeys = Object.keys(this.#serverless.service.functions);
    const functionLogicalIdToAliasMap = {};

    for (const functionKey of functionKeys) {
      const $function = this.#serverless.service.functions[functionKey];
      const functionLogicalId =
        this.provider.naming.getLambdaLogicalId(functionKey);
      const aliasLogicalId = `${functionLogicalId}Alias`;

      // Version predeterminada del alias de la función Lambda
      let aliasResource = {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: functionLogicalId },
          FunctionVersion: DEFAULT_VERSION,
          Name: DEFAULT_NAME,
        },
      };

      try {
        // Obtener la versión actual de la función Lambda
        const response = await withExponentialBackoff(async () => {
          try {
            return await this.provider.request(
              "Lambda",
              "listVersionsByFunction",
              {
                FunctionName: $function.name,
              }
            );
          } catch (err) {
            // Si es la primera vez que se crea una lambda, la versión
            // no existe y caerá por el default. Se puede ignorar el error.
            if (
              err.code !==
              "AWS_LAMBDA_LIST_VERSIONS_BY_FUNCTION_RESOURCE_NOT_FOUND_EXCEPTION"
            ) {
              throw err;
            }
          }
        });

        const currentVersion = response.Versions[response.Versions.length - 1];
        // Crear un recurso de alias para la versión actual
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
        // En caso de error, usar la versión predeterminada
      } finally {
        // Agregar el recurso de alias al template de CloudFormation
        template.Resources[aliasLogicalId] = aliasResource;
        functionLogicalIdToAliasMap[functionLogicalId] = aliasLogicalId;
      }
    }

    // Reemplazar referencias de función con el alias correspondiente
    this.#replaceFunctionReferencesWithAlias(
      template,
      functionLogicalIdToAliasMap
    );
  }

  // Método para aplicar la versión más reciente de las funciones Lambda
  async #lazyVersionApply() {
    const functionKeys = Object.keys(this.#serverless.service.functions);

    for (const functionKey of functionKeys) {
      const $function = this.#serverless.service.functions[functionKey];

      const response = await withExponentialBackoff(() =>
        this.provider.request("Lambda", "listVersionsByFunction", {
          FunctionName: $function.name,
        })
      );

      const versions = response.Versions;
      const latestVersion = versions[versions.length - 1];

      await withExponentialBackoff(() =>
        this.provider.request("Lambda", "updateAlias", {
          FunctionName: $function.name,
          Name: DEFAULT_NAME,
          FunctionVersion: latestVersion.Version,
        })
      );
    }
  }

  // Método privado para reemplazar referencias a funciones con su alias
  #replaceFunctionReferencesWithAlias(template, functionLogicalIdToAliasMap) {
    const replaceReferences = (obj) => {
      // Función recursiva para recorrer y modificar el objeto template
      if (typeof obj !== "object" || obj == null) {
        return;
      }

      for (const key in obj) {
        // Verifica si la clave actual en el objeto es una propiedad propia (no heredada)
        // y si el objeto en esa clave es no nulo y contiene la clave "Fn::GetAtt".
        // "Fn::GetAtt" se utiliza en CloudFormation para obtener el valor de una propiedad de recurso.
        // Este se usa en los recursos de AWS, como los on EventSourceMapping de SQS o la Suscripción de SNS.
        // por lo tanto, se debe reemplazar la referencia a la función con el alias correspondiente.
        if (
          obj[key] != null &&
          Object.prototype.hasOwnProperty.call(obj[key], "Fn::GetAtt")
        ) {
          const logicalId = obj[key]["Fn::GetAtt"][0];

          // Verifica si existe un alias para el ID lógico del recurso Lambda.
          if (functionLogicalIdToAliasMap[logicalId]) {
            // Si existe un alias, reemplaza la referencia original "Fn::GetAtt"
            // por una función "Fn::Join". Esto concatena el ARN de la función Lambda
            // con el nombre por defecto (DEFAULT_NAME), efectivamente actualizando
            // la referencia para apuntar al alias en lugar de la función Lambda directamente.
            obj[key] = {
              "Fn::Join": [
                ":",
                [{ "Fn::GetAtt": [logicalId, "Arn"] }, DEFAULT_NAME],
              ],
            };
          }
        } else if (typeof obj[key] === "object") {
          // Si el valor actual es un objeto (esto incluye arrays),
          // realiza una llamada recursiva para seguir procesando el objeto anidado.
          // Esto asegura que todas las referencias en la plantilla, incluso las anidadas,
          // sean revisadas y actualizadas si es necesario.
          replaceReferences(obj[key]);
        }
      }
    };

    replaceReferences(template);
  }
};

/**
 * Executes a function with exponential backoff retry strategy.
 *
 * @param {Function} retryFunction - The function to be retried upon failure.
 * @param {number} [maxRetries=5] - Maximum number of retries before giving up. Defaults to 5.
 * @param {number} [delay=1000] - Initial delay between retries in milliseconds, which doubles with each retry. Defaults to 1000.
 */
function withExponentialBackoff(retryFunction, maxRetries = 5, delay = 1000) {
  let retries = 0;

  const attempt = async () => {
    return retryFunction().catch(async (error) => {
      if (retries >= maxRetries) {
        throw error;
      }

      delay = delay * 2 ** retries;
      await wait(delay);

      retries++;
      return attempt();
    });
  };

  return attempt();
}

/**
 * Creates a promise that resolves after a specified number of milliseconds.
 * This function can be used to introduce a delay in asynchronous operations.
 *
 * @param {number} ms - The number of milliseconds to wait before the promise resolves.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
