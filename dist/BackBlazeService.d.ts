export default class BackBlazeService {
    constructor(credentials: any);
    connect(): void;
    s3(): () => /*elided*/ any;
    upload(key: any, data: any): void;
    multiPartUpload(Bucket: any, Key: any, buffer: any, options: any): Promise<unknown>;
    downloadClientFile(Key: any): Promise<unknown>;
    downloadServerDatabase(Key: any): Promise<unknown>;
    unzipServerFile(body: any): Promise<unknown>;
    downloadServerScript(Key: any, meta: any): Promise<unknown>;
}
//# sourceMappingURL=BackBlazeService.d.ts.map