declare class Storage {
    constructor();
    setWSApp(app: any): void;
    getWSApp(): any;
    getPlayerCount(): any;
    getRoomMeta(room_slug: any): Promise<import("shared/types/room.js").RoomMeta>;
    getRoomState(room_slug: any, shortid: any): Promise<any>;
    setRoomState(room_slug: any, state: any): Promise<void>;
    getGameInfo(game_slug: any): Promise<unknown>;
    getRoomCounts(room_slug: any): Promise<{
        count: number;
        min: number;
        max: number;
    }>;
    addUser(ws: any): void;
    removeUser(ws: any): void;
    getUser(shortid: any): any;
    getUserByShortId(shortid: any): Promise<void>;
    getPlayerRoomsByGame(shortid: any, game_slug: any): Promise<unknown>;
    getPlayerRooms(shortid: any): Promise<import("shared/types/room.js").PlayerGameRoomExtended[]>;
    checkUserInGame(shortid: any, game_slug: any): Promise<void>;
    setUserRoom(shortid: any, roomMeta: any): Promise<void>;
    cleanupRoom(meta: any): Promise<void>;
}
declare const _default: Storage;
export default _default;
//# sourceMappingURL=storage.d.ts.map