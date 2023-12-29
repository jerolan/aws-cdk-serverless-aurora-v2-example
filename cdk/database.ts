import { Aspects, Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
} from "aws-cdk-lib/aws-ec2";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  AuroraMysqlEngineVersion,
  CfnDBCluster,
  ClusterInstance,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
} from "aws-cdk-lib/aws-rds";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { camelCase } from "lodash";
import { DatabaseProxy, ProxyTarget } from "aws-cdk-lib/aws-rds";
import {
  SecretRotation,
  SecretRotationApplication,
} from "aws-cdk-lib/aws-secretsmanager";

const DATABASE_MIN_CAPACITY = 1;
const DATABASE_MAX_CAPACITY = 16;
const BACKUP_RETENTION_DAYS = 35;
const PASSWORD_ROTATION_DAYS = 30;
const PASSWORD_LENGTH = 30;
const DATABASE_USER = "admin";
const DATABASE_PORT = 3306;

type DatabaseClusterConstructProps = {
  vpc: IVpc;
};

export class DatabaseClusterConstruct extends Construct {
  readonly identifier: string = "DatabaseClusterConstruct";
  readonly publiclyAccessible: boolean = true;
  readonly vpc: IVpc;
  props: DatabaseClusterConstructProps;

  constructor(
    scope: Construct,
    id: string,
    props: DatabaseClusterConstructProps
  ) {
    super(scope, id);

    this.props = props;
    this.vpc = props.vpc;

    const securityGroup = this.createSecurityGroup();
    const secret = this.createSecret();
    const storageEncryptionKey = this.createEncryptionKey();
    const credentials = Credentials.fromSecret(secret, DATABASE_USER);

    const databaseCluster = new DatabaseCluster(
      this,
      this.getResourceIdentifier("DatabaseCluster"),
      {
        credentials,
        storageEncryptionKey,
        copyTagsToSnapshot: true,
        deletionProtection: false,
        storageEncrypted: true,
        vpc: props.vpc,
        port: DATABASE_PORT,
        securityGroups: [securityGroup],
        clusterIdentifier: this.getResourceIdentifier("DatabaseCluster"),
        defaultDatabaseName: this.getResourceName("DatabaseCluster"),
        removalPolicy: RemovalPolicy.SNAPSHOT,
        vpcSubnets: {
          subnetType: SubnetType.PUBLIC,
        },
        engine: DatabaseClusterEngine.auroraMysql({
          version: AuroraMysqlEngineVersion.VER_3_02_0,
        }),
        writer: ClusterInstance.serverlessV2(
          this.getResourceIdentifier("WriterClusterInstance"),
          {
            publiclyAccessible: this.publiclyAccessible,
          }
        ),
        readers: [
          ClusterInstance.serverlessV2(
            this.getResourceIdentifier("ReaderClusterInstance"),
            {
              publiclyAccessible: this.publiclyAccessible,
              scaleWithWriter: true,
            }
          ),
        ],
        backup: {
          retention: Duration.days(BACKUP_RETENTION_DAYS),
        },
      }
    );

    // new SecretRotation(this, "SecretRotation", {
    //   secret: secret,
    //   application: SecretRotationApplication.MYSQL_ROTATION_SINGLE_USER,
    //   vpc: this.vpc,
    //   target: databaseCluster,
    // });

    Aspects.of(databaseCluster).add({
      visit(node) {
        if (node instanceof CfnDBCluster) {
          node.serverlessV2ScalingConfiguration = {
            maxCapacity: DATABASE_MAX_CAPACITY,
            minCapacity: DATABASE_MIN_CAPACITY,
          };
        }
      },
    });

    new DatabaseProxy(this, this.getResourceIdentifier("DatabaseProxy"), {
      dbProxyName: this.getResourceName("DatabaseProxy"),
      proxyTarget: ProxyTarget.fromCluster(databaseCluster),
      secrets: [secret],
      vpc: this.props.vpc,
      requireTLS: true,
    });
  }

  private createSecurityGroup() {
    const allTraffic = Port.allTraffic();
    const tcp3306 = Port.tcpRange(DATABASE_PORT, DATABASE_PORT);
    const defaultRoute = Peer.ipv4("0.0.0.0/0");

    const securityGroup = new SecurityGroup(
      this,
      this.getResourceIdentifier("SecurityGroup"),
      {
        vpc: this.vpc,
        allowAllOutbound: true,
        securityGroupName: this.getResourceName("SecurityGroup"),
      }
    );

    securityGroup.addEgressRule(defaultRoute, allTraffic, "all out");
    securityGroup.addIngressRule(defaultRoute, tcp3306, "tcp3306 MySQL");

    return securityGroup;
  }

  private createSecret() {
    return new Secret(this, this.getResourceIdentifier("Secret"), {
      secretName: this.getResourceName("Secret"),
      generateSecretString: {
        excludeCharacters: "\"@/\\ '",
        generateStringKey: "password",
        passwordLength: PASSWORD_LENGTH,
        secretStringTemplate: JSON.stringify({
          username: DATABASE_USER,
        }),
      },
    });
  }

  private createEncryptionKey() {
    return new Key(this, this.getResourceIdentifier("Key"), {
      enableKeyRotation: true,
    });
  }

  private getResourceIdentifier(resourceSufix: string) {
    return `${this.identifier}${resourceSufix}`;
  }

  private getResourceName(resourceSufix: string) {
    return camelCase(`${process.env.SERVICE_NAME}${resourceSufix}`);
  }
}
