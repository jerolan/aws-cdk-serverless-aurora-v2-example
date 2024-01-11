import { Stack, StackProps } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DatabaseClusterConstruct } from "./database";

/**
 * Define las propiedades específicas para la creación de un stack de base de datos.
 * Extiende StackProps de AWS CDK para incluir propiedades específicas como el nombre de la VPC y de la base de datos.
 * @property {string} vpcName - El nombre de la VPC donde se desplegará la base de datos.
 * @property {string} databaseName - El nombre que se asignará a la base de datos.
 */
export type DatabaseStackProps = StackProps & {
  vpcName: string;
  databaseName: string;
};

/**
 * Clase que representa un stack para crear infraestructura de AWS para una base de datos usando AWS CDK.
 * Extiende la clase Stack de AWS CDK y se encarga de configurar los componentes necesarios para una base de datos,
 * incluyendo una VPC y un DatabaseClusterConstruct.
 *
 * @param {Construct} scope - El ámbito en el que se define este constructo, típicamente una App o un Stage.
 * @param {string} id - Un identificador único para el stack.
 * @param {DatabaseStackProps} props - Propiedades personalizadas del stack incluyendo el nombre de la VPC y de la base de datos.
 */
export class DatabaseStack extends Stack {
  // Identificador único para el stack de base de datos
  readonly identifier: string = "DatabaseStack";

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Busca y recupera una VPC existente por su nombre
    const vpc = Vpc.fromLookup(this, this.getResourceIdentifier("Vpc"), {
      vpcName: props.vpcName,
    });

    // Crea una nueva instancia de DatabaseClusterConstruct, pasando la VPC recuperada
    // y otros parámetros necesarios para configurar el cluster de base de datos
    new DatabaseClusterConstruct(
      this,
      this.getResourceIdentifier("DatabaseClusterConstruct"),
      {
        vpc,
      }
    );
  }

  /**
   * Genera un identificador único para los recursos dentro del stack.
   * Concatena el identificador del stack con un sufijo específico del recurso.
   *
   * @param {string} resourceSufix - El sufijo para el identificador del recurso.
   * @return {string} El identificador completo del recurso.
   */
  private getResourceIdentifier(resourceSufix: string) {
    return `${this.identifier}${resourceSufix}`;
  }
}
