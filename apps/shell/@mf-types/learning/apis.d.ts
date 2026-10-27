
    export type RemoteKeys = 'learning/Learning';
    type PackageType<T> = T extends 'learning/Learning' ? typeof import('learning/Learning') :any;