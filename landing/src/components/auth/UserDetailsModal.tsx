import React, { useState, useEffect } from 'react';
import { Modal } from '../shared/Modal';
import { User, AtSign, Mail, Loader2, AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../services/auth';
import { createGraphQLClient } from '../../services/graphql/client';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { USERNAME_ANIMALS } from '../../data/animals';

const sanitizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

const pickAnimal = () =>
  USERNAME_ANIMALS[Math.floor(Math.random() * USERNAME_ANIMALS.length)];

const buildUsername = (fullname: string, animal: string) => {
  const base = sanitizeName(fullname);
  if (!base) return '';
  return `${base}_${animal}`;
};

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

interface ValidationErrors {
  email?: string;
  username?: string;
  general?: string;
}

export function UserDetailsModal({ isOpen, onClose }: UserDetailsModalProps) {
  const { user, authToken, updateUserData, logout } = useAuth();
  const [formData, setFormData] = useState({
    fullname: user?.fullname && user.fullname !== 'User' ? user.fullname : '',
    email: user?.email || '',
    username: user?.username || ''
  });
  const [animalSeed, setAnimalSeed] = useState(() => pickAnimal());
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    setFormData(prev => ({
      fullname: prev.fullname || (user?.fullname && user.fullname !== 'User' ? user.fullname : ''),
      email: prev.email || user?.email || '',
      username: prev.username || user?.username || ''
    }));
  }, [user?.fullname, user?.email, user?.username]);

  useEffect(() => {
    if (user?.username || usernameEdited) return;
    setFormData(prev => ({
      ...prev,
      username: buildUsername(prev.fullname, animalSeed)
    }));
  }, [formData.fullname, animalSeed, user?.username, usernameEdited]);

  const handleError = (error: any) => {
    // Check if it's a uniqueness violation error
    if (error?.response?.errors?.[0]?.message?.includes('auth_username_key')) {
      setAnimalSeed(pickAnimal());
      setValidationErrors(prev => ({
        ...prev,
        username: 'That username was just taken — we picked a new one for you. Please try again.'
      }));
    } else if (error?.response?.errors?.[0]?.message?.includes('auth_email_carrier_website_id_key')) {
      setValidationErrors(prev => ({
        ...prev,
        email: 'This email is already in use'
      }));
    } else {
      setValidationErrors(prev => ({
        ...prev,
        general: 'Failed to update profile. Please try again.'
      }));
    }
  };

  const sendVerificationEmail = async (email: string, userId: string) => {
    try {
      const client = createGraphQLClient(authToken!);
      await client.request(`
        mutation SendVerificationEmail($email: String!, $user_id: uuid!) {
          sendVerificationEmail_v5(email: $email, user_id: $user_id) {
            affected_rows
          }
        }
      `, {
        email,
        user_id: userId,
      });
      
      showSuccessToast('Verification email sent! Please check your inbox.');
    } catch (err) {
      console.error('Error sending verification email:', err);
      showErrorToast('Failed to send verification email');
    }
  };

  const validateField = async (field: 'email' | 'username', value: string) => {
    if (!authToken || !value.trim()) return;

    try {
      const client = createGraphQLClient(authToken, 'https://db.subspace.money/v1/graphql');
      const { auth } = await client.request(`
        query CheckExisting($value: String!) {
          auth(where: {${field}: {_eq: $value}, id: {_neq: "${user?.id}"}}) {
            ${field}
          }
        }
      `, { value: value.trim() });

      if (auth.length > 0) {
        setValidationErrors(prev => ({
          ...prev,
          [field]: `This ${field} is already in use`
        }));
        return false;
      }

      setValidationErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
      return true;
    } catch (err) {
      console.error(`Error validating ${field}:`, err);
      return false;
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (formData.email) {
        validateField('email', formData.email);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [formData.email]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (formData.username) {
        validateField('username', formData.username);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [formData.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !authToken) return;

    // Validate all fields
    const isEmailValid = await validateField('email', formData.email);
    const isUsernameValid = await validateField('username', formData.username);

    if (!isEmailValid || !isUsernameValid) {
      return;
    }

    try {
      setLoading(true);
      setValidationErrors({});

      const client = createGraphQLClient(authToken);
      await client.request(`
        mutation UpdateUserDetails(
          $id: uuid!,
          $fullname: String!,
          $email: String!,
          $username: String!
        ) {
          update_vocallabs_client(
            where: { id: { _eq: $id } },
            _set: {
              fullname: $fullname,
              email_id: $email,
              username: $username
            }
          ) {
            affected_rows
            returning {
              id
              fullname
              email_id
              username
            }
          }
        }
      `, {
        id: user.id,
        ...formData
      });


      await updateUserData();
      showSuccessToast('Profile updated successfully');
      onClose?.();
    } catch (err) {
      console.error('Error updating user details:', err);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={undefined} title="Complete Your Profile" hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Profile Completion Required
              </h3>
              <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-200">
                Please complete your profile and verify your email address to continue. This step cannot be skipped.
              </p>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        {validationErrors.general && (
          <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-400 p-4 mb-4">
            <p className="text-sm text-red-700 dark:text-red-200">
              {validationErrors.general}
            </p>
          </div>
        )}

        <div>
          <label htmlFor="fullname" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Full Name <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              id="fullname"
              required
              value={formData.fullname}
              onChange={(e) => setFormData(prev => ({ ...prev, fullname: e.target.value }))}
              className={cn(
                "block w-full pl-10 py-2 sm:text-sm rounded-md",
                "border-gray-300 dark:border-gray-600",
                "focus:ring-primary-500 focus:border-primary-500",
                "dark:bg-gray-700 dark:text-white"
              )}
              placeholder="John Doe"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email Address <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className={cn(
                "block w-full pl-10 py-2 sm:text-sm rounded-md",
                "border-gray-300 dark:border-gray-600",
                "focus:ring-primary-500 focus:border-primary-500",
                "dark:bg-gray-700 dark:text-white",
                validationErrors.email && "border-red-500 dark:border-red-500"
              )}
              placeholder="john@example.com"
            />
          </div>
          {validationErrors.email && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1" />
              {validationErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Username <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <AtSign className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              id="username"
              required
              value={formData.username}
              onChange={(e) => {
                setUsernameEdited(true);
                setFormData(prev => ({ ...prev, username: e.target.value }));
              }}
              className={cn(
                "block w-full pl-10 pr-12 py-2 sm:text-sm rounded-md",
                "border-gray-300 dark:border-gray-600",
                "focus:ring-primary-500 focus:border-primary-500",
                "dark:bg-gray-700 dark:text-white",
                validationErrors.username && "border-red-500 dark:border-red-500"
              )}
              placeholder="auto-generated from your name"
            />
            <button
              type="button"
              onClick={() => {
                setUsernameEdited(false);
                setAnimalSeed(pickAnimal());
              }}
              disabled={!formData.fullname.trim() || !!user?.username}
              title="Regenerate from your name"
              className={cn(
                "absolute inset-y-0 right-0 pr-3 flex items-center",
                "text-gray-400 hover:text-primary-500",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Auto-generated from your name — edit it, or use the refresh icon to regenerate.
          </p>
          {validationErrors.username && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1" />
              {validationErrors.username}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !!validationErrors.email || !!validationErrors.username || !formData.email || !formData.username || !formData.fullname}
          className={cn(
            "w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium",
            "text-white bg-primary-600 hover:bg-primary-700",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Complete Profile'
          )}
        </button>

        <button
          type="button"
          onClick={() => logout()}
          disabled={loading}
          className={cn(
            "w-full flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium",
            "text-gray-700 dark:text-gray-300 bg-transparent",
            "border border-gray-300 dark:border-gray-600",
            "hover:bg-gray-50 dark:hover:bg-gray-700",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </button>
      </form>
    </Modal>
  );
}