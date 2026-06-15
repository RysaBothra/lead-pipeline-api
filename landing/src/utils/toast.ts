import { toast, ToastContent } from 'react-toastify';
import { extractErrorMessage, sanitizeErrorMessage } from './errorHandling';

export const showSuccessToast = (message: ToastContent) => {
  const toastId = typeof message === 'string' ? message : undefined;
  if (toastId && toast.isActive(toastId)) {
    return;
  }

  toast.success(message, {
    position: "bottom-left",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: "dark",
    closeButton: true,
    toastId: toastId
  });
};

export const showErrorToast = (message: string | unknown) => {
  const extractedMessage = typeof message === 'string' ? message : extractErrorMessage(message);
  const cleanMessage = sanitizeErrorMessage(extractedMessage);
  
  if (toast.isActive(cleanMessage)) {
    return;
  }
  
  toast.error(cleanMessage, {
    position: "bottom-left",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: "dark",
    closeButton: true,
    toastId: cleanMessage
  });
};

export const showInfoToast = (message: string) => {
  if (toast.isActive(message)) {
    return;
  }

  toast.info(message, {
    position: "bottom-left",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: "dark",
    closeButton: true,
    toastId: message
  });
};

export const showLoadingToast = (message: string) => {
  return toast.loading(message, {
    position: "bottom-left",
    closeOnClick: false,
    pauseOnHover: true,
    draggable: false,
    theme: "dark",
    closeButton: true
  });
};

export const updateToast = (toastId: string | number, type: 'success' | 'error', message: string) => {
  toast.update(toastId, {
    render: message,
    type,
    isLoading: false,
    autoClose: 5000,
    closeOnClick: true,
    draggable: true,
    theme: "dark",
    closeButton: true
  });
};