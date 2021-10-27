import * as grpc from '@grpc/grpc-js';

import {
  ClientFactoryConstructor,
  createService,
  createServiceClient,
  DynamicMethods,
  getServiceNames,
  grpcLoad,
  GrpcService,
  lookupPackage,
} from './utils';

export {grpc, ClientFactoryConstructor};

export interface GenericServerBuilder<T> {
  start(address: string, credentials?: grpc.ServerCredentials): Promise<void>;

  forceShutdown(): void;
}

export function serverBuilder<T>(
  protoPath: string,
  packageName: string,
  server = new grpc.Server(),
  includeDirs?: string[],
): T & GenericServerBuilder<T> {
  const builder: DynamicMethods = {
    async start(address, credentials) {
      return new Promise((resolve, reject) => {
        server.bindAsync(address, credentials || grpc.ServerCredentials.createInsecure(), error => {
          if (error) {
            reject(error);
            return;
          }
          server.start();
          resolve();
        });
      });
    },
    forceShutdown() {
      server.forceShutdown();
    },
  } as GenericServerBuilder<T>;

  const pkg = lookupPackage(grpcLoad(protoPath, includeDirs), packageName);
  for (const name of getServiceNames(pkg)) {
    builder[`add${name}`] = function (rxImpl: DynamicMethods) {
      const serviceData = (pkg[name] as any) as GrpcService<any>;
      server.addService(serviceData.service, createService(serviceData, rxImpl));
      return this;
    };
  }

  return builder as any;
}

export function clientFactory<T>(protoPath: string, packageName: string, includeDirs?: string[]) {
  class Constructor {
    readonly __args: [string, grpc.ChannelCredentials, any | undefined];

    constructor(address: string, credentials?: grpc.ChannelCredentials, options: any = undefined) {
      this.__args = [address, credentials || grpc.credentials.createInsecure(), options];
    }
  }

  const prototype: DynamicMethods = Constructor.prototype;
  const pkg = lookupPackage(grpcLoad(protoPath, includeDirs), packageName);
  for (const name of getServiceNames(pkg)) {
    prototype[`get${name}`] = function (this: Constructor) {
      return createServiceClient((pkg[name] as any) as GrpcService<any>, this.__args);
    };
  }

  return (Constructor as any) as ClientFactoryConstructor<T>;
}
