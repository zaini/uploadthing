// @vitest-environment happy-dom

import { describe, expect, vi } from "vitest";

import { generateUploadThingURL } from "@uploadthing/shared";

import {
  it,
  middlewareMock,
  onErrorMock,
  s3Mock,
  setupUTServer,
  uploadCompleteMock,
  useBadS3,
  utApiMock,
} from "./__test-helpers";

describe("uploadFiles", () => {
  it("uploads with presigned post", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });
    const file = new File(["foo"], "foo.txt", { type: "text/plain" });

    await expect(
      uploadFiles("foo", {
        files: [file],
        skipPolling: true,
      }),
    ).resolves.toEqual([
      {
        name: "foo.txt",
        size: 3,
        type: "text/plain",
        customId: null,
        serverData: null,
        key: "abc-123.txt",
        url: "https://utfs.io/f/abc-123.txt",
      },
    ]);

    expect(s3Mock).toHaveBeenCalledOnce();
    expect(s3Mock).toHaveBeenCalledWith(
      "https://bucket.s3.amazonaws.com/",
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(middlewareMock).toHaveBeenCalledOnce();
    expect(onErrorMock).not.toHaveBeenCalled();
    await vi.waitUntil(() => uploadCompleteMock.mock.calls.length > 0);

    close();
  });

  it("uploads with multipart upload", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });
    const bigFile = new File([new ArrayBuffer(10 * 1024 * 1024)], "foo.txt", {
      type: "text/plain",
    });

    await expect(
      uploadFiles("foo", {
        files: [bigFile],
        skipPolling: true,
      }),
    ).resolves.toEqual([
      {
        name: "foo.txt",
        size: 10485760,
        type: "text/plain",
        customId: null,
        serverData: null,
        key: "abc-123.txt",
        url: "https://utfs.io/f/abc-123.txt",
      },
    ]);

    expect(s3Mock).toHaveBeenCalledTimes(2);
    expect(s3Mock).toHaveBeenNthCalledWith(
      1,
      "https://bucket.s3.amazonaws.com/abc-123.txt?partNumber=1&uploadId=random-upload-id",
      expect.objectContaining({
        method: "PUT",
      }),
    );

    expect(middlewareMock).toHaveBeenCalledOnce();
    expect(onErrorMock).not.toHaveBeenCalled();
    await vi.waitUntil(() => uploadCompleteMock.mock.calls.length > 0);

    close();
  });

  it("sends custom headers if set (static object)", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });

    const file = new File(["foo"], "foo.txt", { type: "text/plain" });
    await expect(
      uploadFiles("foo", {
        files: [file],
        skipPolling: true,
        headers: {
          authorization: "Bearer my-auth-token",
        },
      }),
    ).resolves.toEqual([
      {
        name: "foo.txt",
        size: 3,
        type: "text/plain",
        customId: null,
        serverData: null,
        key: "abc-123.txt",
        url: "https://utfs.io/f/abc-123.txt",
      },
    ]);

    expect(middlewareMock.mock.calls[0][0].req.headers).toMatchObject({
      authorization: "Bearer my-auth-token",
      "x-uploadthing-package": "vitest",
      "x-uploadthing-version": expect.stringMatching(/\d+\.\d+\.\d+/),
    });

    close();
  });

  it("sends custom headers if set (async function)", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });

    const file = new File(["foo"], "foo.txt", { type: "text/plain" });
    await expect(
      uploadFiles("foo", {
        files: [file],
        skipPolling: true,
        headers: async () => ({
          authorization: "Bearer my-auth-token",
        }),
      }),
    ).resolves.toEqual([
      {
        name: "foo.txt",
        size: 3,
        type: "text/plain",
        customId: null,
        serverData: null,
        key: "abc-123.txt",
        url: "https://utfs.io/f/abc-123.txt",
      },
    ]);

    expect(middlewareMock.mock.calls[0][0].req.headers).toMatchObject({
      authorization: "Bearer my-auth-token",
      "x-uploadthing-package": "vitest",
      "x-uploadthing-version": expect.stringMatching(/\d+\.\d+\.\d+/),
    });

    close();
  });

  it("reports of failed post upload", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });
    useBadS3();

    const file = new File(["foo"], "foo.txt", { type: "text/plain" });

    await expect(
      uploadFiles("foo", {
        files: [file],
        skipPolling: true,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Failed to upload file foo.txt to S3]`,
    );

    expect(s3Mock).toHaveBeenCalledOnce();
    expect(onErrorMock).toHaveBeenCalledOnce();
    expect(utApiMock).toHaveBeenCalledWith(
      generateUploadThingURL("/api/failureCallback"),
      {
        body: '{"fileKey":"abc-123.txt","uploadId":null}',
        headers: {
          "Content-Type": "application/json",
          "x-uploadthing-api-key": "sk_test_123",
          "x-uploadthing-be-adapter": "express",
          "x-uploadthing-fe-package": "vitest",
          "x-uploadthing-version": expect.stringMatching(/\d+\.\d+\.\d+/),
        },
        method: "POST",
      },
    );

    close();
  });

  it("reports of failed multipart upload", async ({ db }) => {
    const { uploadFiles, close } = setupUTServer({ db });
    useBadS3();

    const bigFile = new File([new ArrayBuffer(10 * 1024 * 1024)], "foo.txt", {
      type: "text/plain",
    });

    await expect(
      uploadFiles("foo", {
        files: [bigFile],
        skipPolling: true,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Failed to upload file foo.txt to S3]`,
    );

    expect(s3Mock).toHaveBeenCalledTimes(2);
    expect(onErrorMock).toHaveBeenCalledOnce();
    expect(utApiMock).toHaveBeenCalledWith(
      generateUploadThingURL("/api/failureCallback"),
      {
        body: '{"fileKey":"abc-123.txt","uploadId":"random-upload-id"}',
        headers: {
          "Content-Type": "application/json",
          "x-uploadthing-api-key": "sk_test_123",
          "x-uploadthing-be-adapter": "express",
          "x-uploadthing-fe-package": "vitest",
          "x-uploadthing-version": expect.stringMatching(/\d+\.\d+\.\d+/),
        },
        method: "POST",
      },
    );

    close();
  });
});
