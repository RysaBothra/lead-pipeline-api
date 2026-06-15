import { v4 as uuidv4 } from 'uuid';

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('passkey_device_id');
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('passkey_device_id', deviceId);
  }
  return deviceId;
}