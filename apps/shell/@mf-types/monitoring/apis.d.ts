
    export type RemoteKeys = 'monitoring/Monitoring';
    type PackageType<T> = T extends 'monitoring/Monitoring' ? typeof import('monitoring/Monitoring') :any;