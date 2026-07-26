import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";

import {
  ManagerMessageSchema,
  ProtocolVersion,
  RuntimeMessageSchema,
  RuntimeStatusSchema,
} from "#/generated/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle_pb.js";
import type {
  ManagerMessage,
  RuntimeState,
  SystemBrowserDiagnosticSchema,
} from "#/generated/job_boardwalk/desktop_lifecycle/v1/desktop_lifecycle_pb.js";

const maximumFrameLength = 1024 * 1024;
const maximumLengthPrefixBytes = 5;

function encodeLengthPrefix(length: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = length;
  do {
    const payload = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining === 0 ? payload : payload | 0x80);
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

function decodeLengthPrefix(
  buffer: Buffer,
): { readonly frameLength: number; readonly prefixLength: number } | null {
  let frameLength = 0;
  let multiplier = 1;
  const availablePrefixBytes = Math.min(buffer.length, maximumLengthPrefixBytes);
  for (let index = 0; index < availablePrefixBytes; index += 1) {
    const byte = buffer[index] as number;
    frameLength += (byte & 127) * multiplier;
    if ((byte & 0x80) === 0) {
      if (frameLength > maximumFrameLength) {
        throw new Error(`Desktop lifecycle frame exceeds ${maximumFrameLength} bytes`);
      }
      return { frameLength, prefixLength: index + 1 };
    }
    multiplier *= 128;
  }
  if (buffer.length >= maximumLengthPrefixBytes) {
    throw new Error("Desktop lifecycle frame has an invalid length prefix");
  }
  return null;
}

function encodeFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > maximumFrameLength) {
    throw new Error(`Desktop lifecycle frame exceeds ${maximumFrameLength} bytes`);
  }
  const prefix = encodeLengthPrefix(payload.length);
  const frame = new Uint8Array(prefix.length + payload.length);
  frame.set(prefix);
  frame.set(payload, prefix.length);
  return frame;
}

async function* readFrames(input: Readable): AsyncGenerator<Uint8Array> {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (pending.length > 0) {
      const prefix = decodeLengthPrefix(pending);
      if (!prefix || pending.length < prefix.prefixLength + prefix.frameLength) {
        break;
      }
      const frameEnd = prefix.prefixLength + prefix.frameLength;
      yield pending.subarray(prefix.prefixLength, frameEnd);
      pending = pending.subarray(frameEnd);
    }
  }
  if (pending.length > 0) {
    throw new Error("Desktop lifecycle channel ended with a truncated frame");
  }
}

export function encodeRuntimeStatus(
  status: MessageInitShape<typeof RuntimeStatusSchema>,
): Uint8Array {
  const runtimeMessage = create(RuntimeMessageSchema, {
    event: {
      case: "status",
      value: create(RuntimeStatusSchema, status),
    },
    protocolVersion: ProtocolVersion.V1,
  });
  return encodeFrame(toBinary(RuntimeMessageSchema, runtimeMessage));
}

export async function* readManagerMessages(input: Readable): AsyncGenerator<ManagerMessage> {
  for await (const frame of readFrames(input)) {
    const message = fromBinary(ManagerMessageSchema, frame);
    if (message.protocolVersion !== ProtocolVersion.V1) {
      throw new Error(`Unsupported desktop lifecycle protocol version: ${message.protocolVersion}`);
    }
    if (!message.command.case) {
      throw new Error("Desktop lifecycle manager message has no command");
    }
    yield message;
  }
}

export interface RuntimeStatusInput {
  readonly dashboardUrl?: string;
  readonly detail: string;
  readonly logPath: string;
  readonly state: RuntimeState;
  readonly systemBrowser?: MessageInitShape<typeof SystemBrowserDiagnosticSchema>;
}
