"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createZipFromDirectory = createZipFromDirectory;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();
function crc32(buffer) {
    let crc = 0xffffffff;
    for (let index = 0; index < buffer.length; index += 1) {
        crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function collectFiles(rootDir, currentDir = rootDir) {
    const entries = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolutePath = path_1.default.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(rootDir, absolutePath));
            continue;
        }
        if (!entry.isFile())
            continue;
        files.push({
            relativePath: path_1.default.relative(rootDir, absolutePath).replace(/\\/g, "/"),
            absolutePath,
        });
    }
    return files;
}
function createZipFromDirectory(sourceDir, zipPath) {
    const files = collectFiles(sourceDir);
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
        const data = fs_1.default.readFileSync(file.absolutePath);
        const nameBuffer = Buffer.from(file.relativePath, "utf8");
        const checksum = crc32(data);
        const localHeader = Buffer.alloc(30 + nameBuffer.length);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(data.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);
        nameBuffer.copy(localHeader, 30);
        localParts.push(localHeader, data);
        const centralHeader = Buffer.alloc(46 + nameBuffer.length);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(data.length, 20);
        centralHeader.writeUInt32LE(data.length, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);
        nameBuffer.copy(centralHeader, 46);
        centralParts.push(centralHeader);
        offset += localHeader.length + data.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const localData = Buffer.concat(localParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(localData.length, 16);
    endRecord.writeUInt16LE(0, 20);
    fs_1.default.writeFileSync(zipPath, Buffer.concat([localData, centralDirectory, endRecord]));
}
