
    export type RemoteKeys = 'planning/Planning';
    type PackageType<T> = T extends 'planning/Planning' ? typeof import('planning/Planning') :any;