import { apiClient } from './client';

export const uploadsApi = {
  upload: (
    formData: FormData,
    onUploadProgress?: (progressEvent: { loaded: number; total?: number }) => void,
  ) =>
    apiClient
      .post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((r) => r.data),
};

export const pdfApi = {
  getSalaryPdf: (year: number, month: number) =>
    apiClient.get(`/pdf/salary/${year}/${month}`, { responseType: 'blob' }),
};
