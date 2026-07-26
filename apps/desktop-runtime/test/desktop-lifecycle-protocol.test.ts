import { Readable } from "node:stream";

import { create, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";

import { readManagerMessages } from "#/desktop-lifecycle-protocol.js";
import {
  ManagerMessageSchema,
  ProtocolVersion,
} from "#/generated/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle_pb.js";

const expectedMessageCount = 1;
const firstMessageIndex = 0;
const frameStartIndex = 0;
const frameSplitIndex = 2;
const finalByteOffset = -1;

async function readMessages(chunks: readonly Uint8Array[]) {
  const messages = [];
  for await (const message of readManagerMessages(Readable.from(chunks))) {
    messages.push(message);
  }
  return messages;
}

function encodeManagerFrame(message: MessageInitShape<typeof ManagerMessageSchema>): Uint8Array {
  const payload = toBinary(ManagerMessageSchema, create(ManagerMessageSchema, message));
  return Uint8Array.from([payload.length, ...payload]);
}

describe("Desktop lifecycle protocol", () => {
  test("decodes a versioned shutdown command split across transport chunks", async () => {
    const frame = encodeManagerFrame({
      command: { case: "shutdown", value: {} },
      protocolVersion: ProtocolVersion.V1,
    });
    const messages = await readMessages([
      frame.subarray(frameStartIndex, frameSplitIndex),
      frame.subarray(frameSplitIndex),
    ]);

    expect(messages).toHaveLength(expectedMessageCount);
    expect(messages.at(firstMessageIndex)?.protocolVersion).toBe(ProtocolVersion.V1);
    expect(messages.at(firstMessageIndex)?.command.case).toBe("shutdown");
  });

  test.each([
    encodeManagerFrame({
      command: { case: "shutdown", value: {} },
      protocolVersion: ProtocolVersion.UNSPECIFIED,
    }),
    encodeManagerFrame({ protocolVersion: ProtocolVersion.V1 }),
  ])("rejects an out-of-contract message", async (frame) => {
    await expect(readMessages([frame])).rejects.toThrow();
  });

  test("rejects a truncated transport frame", async () => {
    const frame = encodeManagerFrame({
      command: { case: "shutdown", value: {} },
      protocolVersion: ProtocolVersion.V1,
    });

    await expect(
      readMessages([frame.subarray(frameStartIndex, finalByteOffset)]),
    ).rejects.toThrow();
  });
});
