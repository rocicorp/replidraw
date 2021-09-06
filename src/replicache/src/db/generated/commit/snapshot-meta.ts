// automatically generated by the FlatBuffers compiler, do not modify

import * as flatbuffers from 'flatbuffers';

export class SnapshotMeta {
  bb: flatbuffers.ByteBuffer | null = null;
  bb_pos = 0;
  __init(i: number, bb: flatbuffers.ByteBuffer): SnapshotMeta {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  static getRootAsSnapshotMeta(
    bb: flatbuffers.ByteBuffer,
    obj?: SnapshotMeta,
  ): SnapshotMeta {
    return (obj || new SnapshotMeta()).__init(
      bb.readInt32(bb.position()) + bb.position(),
      bb,
    );
  }

  static getSizePrefixedRootAsSnapshotMeta(
    bb: flatbuffers.ByteBuffer,
    obj?: SnapshotMeta,
  ): SnapshotMeta {
    bb.setPosition(bb.position() + flatbuffers.SIZE_PREFIX_LENGTH);
    return (obj || new SnapshotMeta()).__init(
      bb.readInt32(bb.position()) + bb.position(),
      bb,
    );
  }

  lastMutationId(): flatbuffers.Long {
    const offset = this.bb!.__offset(this.bb_pos, 4);
    return offset
      ? this.bb!.readUint64(this.bb_pos + offset)
      : this.bb!.createLong(0, 0);
  }

  cookieJson(index: number): number | null {
    const offset = this.bb!.__offset(this.bb_pos, 6);
    return offset
      ? this.bb!.readUint8(this.bb!.__vector(this.bb_pos + offset) + index)
      : 0;
  }

  cookieJsonLength(): number {
    const offset = this.bb!.__offset(this.bb_pos, 6);
    return offset ? this.bb!.__vector_len(this.bb_pos + offset) : 0;
  }

  cookieJsonArray(): Uint8Array | null {
    const offset = this.bb!.__offset(this.bb_pos, 6);
    return offset
      ? new Uint8Array(
          this.bb!.bytes().buffer,
          this.bb!.bytes().byteOffset + this.bb!.__vector(this.bb_pos + offset),
          this.bb!.__vector_len(this.bb_pos + offset),
        )
      : null;
  }

  static startSnapshotMeta(builder: flatbuffers.Builder) {
    builder.startObject(2);
  }

  static addLastMutationId(
    builder: flatbuffers.Builder,
    lastMutationId: flatbuffers.Long,
  ) {
    builder.addFieldInt64(0, lastMutationId, builder.createLong(0, 0));
  }

  static addCookieJson(
    builder: flatbuffers.Builder,
    cookieJsonOffset: flatbuffers.Offset,
  ) {
    builder.addFieldOffset(1, cookieJsonOffset, 0);
  }

  static createCookieJsonVector(
    builder: flatbuffers.Builder,
    data: number[] | Uint8Array,
  ): flatbuffers.Offset {
    builder.startVector(1, data.length, 1);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt8(data[i]!);
    }
    return builder.endVector();
  }

  static startCookieJsonVector(builder: flatbuffers.Builder, numElems: number) {
    builder.startVector(1, numElems, 1);
  }

  static endSnapshotMeta(builder: flatbuffers.Builder): flatbuffers.Offset {
    const offset = builder.endObject();
    return offset;
  }

  static createSnapshotMeta(
    builder: flatbuffers.Builder,
    lastMutationId: flatbuffers.Long,
    cookieJsonOffset: flatbuffers.Offset,
  ): flatbuffers.Offset {
    SnapshotMeta.startSnapshotMeta(builder);
    SnapshotMeta.addLastMutationId(builder, lastMutationId);
    SnapshotMeta.addCookieJson(builder, cookieJsonOffset);
    return SnapshotMeta.endSnapshotMeta(builder);
  }
}
