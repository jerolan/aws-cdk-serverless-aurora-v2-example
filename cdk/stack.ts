import { Stack, StackProps } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DatabaseClusterConstruct } from "./database";

/**
 * Properties for the DatabaseStack.
 * Extends StackProps from AWS CDK to include specific properties for creating a database stack.
 * This type specifies additional configuration required to initialize the DatabaseStack.
 *
 * @property {string} vpcName - The name of the VPC in which the database will be deployed.
 * @property {string} databaseName - The name to assign to the database.
 */
export type DatabaseStackProps = StackProps & {
  vpcName: string;
  databaseName: string;
};

/**
 * Represents a stack that creates AWS infrastructure for a database using AWS CDK.
 * This class extends the Stack class from AWS CDK and is responsible for setting up the necessary components
 * for a database, including a VPC and a DatabaseClusterConstruct.
 *
 * @param {Construct} scope - The scope in which to define this construct, typically an App or a Stage.
 * @param {string} id - A unique identifier for the stack.
 * @param {DatabaseStackProps} props - Custom stack properties including VPC name and database name.
 */
export class DatabaseStack extends Stack {
  readonly identifier: string = "DatabaseStack";

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, this.getResourceIdentifier("Vpc"), {
      vpcName: props.vpcName,
    });

    new DatabaseClusterConstruct(
      this,
      this.getResourceIdentifier("DatabaseClusterConstruct"),
      {
        vpc,
      }
    );
  }

  private getResourceIdentifier(resourceSufix: string) {
    return `${this.identifier}${resourceSufix}`;
  }
}
