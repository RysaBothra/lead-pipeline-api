import { useState, useCallback } from 'react'; // Import useCallback
import passkeyApi, { PasskeyLoginResponse, type PasskeyDevice } from '../services/auth/api/passkeyApi';
import { showErrorToast, showSuccessToast } from '../utils/toast'; // Add showSuccessToast

export function usePasskey() {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [devices, setDevices] = useState<PasskeyDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // LOGIN check - Unchanged (uses phone)
  const checkPasskeyAvailability = useCallback(async (phone: string) => {
    // No loading state needed for this check usually
    try {
      const result = await passkeyApi.checkPasskeyAvailability(phone);
      return result;
    } catch (error) {
      console.error('Error checking passkey availability:', error);
      // Let the component handle UI feedback if needed
      throw error;
    }
  }, []);

  // LOGIN action - Unchanged (uses phone)
  const loginWithPasskey = useCallback(async (phone: string): Promise<PasskeyLoginResponse | null> => {
    setLoading(true);
    try {
      const availability = await passkeyApi.checkPasskeyAvailability(phone);

      if (!availability.hasPasskey || !availability.options) {
        showErrorToast('No passkey found for this phone number');
        return null;
      }

      const result = await passkeyApi.loginWithPasskey(phone, availability.options);
      return result;
    } catch (error) {
      console.error('Error during passkey login:', error);

      if (error instanceof Error) {
        // More specific error messages from the API layer
        showErrorToast(error.message || 'Failed to login with passkey');
      } else {
        showErrorToast('An unknown error occurred during passkey login');
      }

      return null;
    } finally {
      setLoading(false);
    }
  }, []); // Include passkeyApi if it could change, but it's likely stable

  // REGISTER action - UPDATED (uses userId, authToken)
  const registerPasskey = useCallback(
    async (userId: string, authToken: string, deviceName?: string): Promise<boolean> => {
      setLoading(true);
      try {
        const success = await passkeyApi.registerPasskey(userId, authToken, deviceName);
        return success; // API layer throws on failure
      } catch (error) {
        console.error('Error during passkey registration:', error);

        if (error instanceof Error) {
           // More specific error messages from the API layer
          showErrorToast(error.message || 'Failed to register passkey');
        } else {
          showErrorToast('An unknown error occurred during passkey registration');
        }

        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // DELETE action - NEW (uses userId, authToken)
  const deletePasskey = useCallback(async (userId: string, authToken: string): Promise<boolean> => {
      setDeleting(true);
      try {
          await passkeyApi.deletePasskey(userId, authToken);
          return true; // API layer throws on failure
      } catch (error) {
          console.error('Error deleting passkey:', error);
           if (error instanceof Error) {
              showErrorToast(error.message || 'Failed to delete passkey');
           } else {
              showErrorToast('An unknown error occurred while deleting passkey');
           }
          return false;
      } finally {
          setDeleting(false);
      }
  }, []);

  // LIST DEVICES - Get all passkey devices for user
  const listDevices = useCallback(async (userId: string, authToken: string): Promise<PasskeyDevice[]> => {
    setLoadingDevices(true);
    try {
      const deviceList = await passkeyApi.listPasskeyDevices(userId, authToken);
      setDevices(deviceList);
      return deviceList;
    } catch (error) {
      console.error('Error listing passkey devices:', error);
      if (error instanceof Error) {
        showErrorToast(error.message || 'Failed to load devices');
      }
      return [];
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // DELETE DEVICE - Delete a specific device
  const deleteDevice = useCallback(async (userId: string, deviceId: string, authToken: string): Promise<boolean> => {
    setDeleting(true);
    try {
      await passkeyApi.deletePasskeyDevice(userId, deviceId, authToken);
      showSuccessToast('Device deleted successfully');
      // Refresh device list after deletion
      await listDevices(userId, authToken);
      return true;
    } catch (error) {
      console.error('Error deleting passkey device:', error);
      if (error instanceof Error) {
        showErrorToast(error.message || 'Failed to delete device');
      }
      return false;
    } finally {
      setDeleting(false);
    }
  }, [listDevices]);

  return {
    loading,
    deleting,
    devices,
    loadingDevices,
    checkPasskeyAvailability,
    loginWithPasskey,
    registerPasskey,
    deletePasskey,
    listDevices,
    deleteDevice,
  };
}
