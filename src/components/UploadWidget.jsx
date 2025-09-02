import React, { useState } from "react";
import { compressVideo } from "../utils/video-upload.service";
import { DEFAULT_COMPRESSION_PRESET } from "../utils/constants";
import { formatBytes } from "../utils/helper";

export default function UploadWidget() {
  const [fileToCompress, setFileToCompress] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const handleChange = async (e) => {
    try {
      const file = e.target.files;
      if (!file || file.length === 0) return;

      const size = formatBytes(file[0].size);
      if (size > 500) {
        setError("File size exceeds 500MB limit.");
        return;
      }
      // Optional: quick short-circuit for tiny files
      const shouldCompress = size > 25 || !/\.mp4$/i.test(file.name);

      const uploadFile = shouldCompress
        ? await compressVideo(file[0], DEFAULT_COMPRESSION_PRESET, setUploading)
        : file[0];
      setFileToCompress(uploadFile);
      setUploading(false);
    } catch (e) {
      console.error(e);
      setError("An error occurred during file processing.");
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <p className="block text-xxs font-medium tracking-label leading-4 capitalize text-dark-gray">
        Upload a video
      </p>
      <label
        htmlFor="file-upload"
        className="block py-3 w-full rounded-lg border cursor-pointer border-dashed border-dark-gray hover:outline outline-offset-1 outline-1 outline-light-gray text-xs font-medium tracking-75rem leading-4 text-light-gray text-center line-clamp-1"
      >
        {fileToCompress ? fileToCompress.name : "Browse"}
      </label>
      <input
        id="file-upload"
        onChange={handleChange}
        type="file"
        className="hidden"
        accept="video/*, text/plain"
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      {uploading && (
        <div className="flex items-center space-x-2 text-green-600">
          <div className="spinner"></div>
          <p>Processing...</p>
        </div>
      )}
    </div>
  );
}
