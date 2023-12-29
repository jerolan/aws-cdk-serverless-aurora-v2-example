import { Stack, StackProps } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { DatabaseClusterConstruct } from "./database";

export type DatabaseStackProps = StackProps & {
  vpcName: string;
  databaseName: string;
};

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
