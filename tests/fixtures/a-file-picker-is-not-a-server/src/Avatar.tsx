import { Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useState } from 'react';

export function Avatar() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const onChange = (file: UploadFile) => setFiles([file]);
  return <Upload fileList={files} beforeUpload={() => false} onChange={({ file }) => onChange(file)} />;
}

export const dropzoneOptions = {
  accept: ['.png', '.jpg'],
  maxFiles: 1,
};
