import {
    createNewUserDoc,
    createUserDoc,
    revokeMyRefreshTokens,
    signIn,
    signUp,
} from '@/src/services/user.service';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Mock Firebase modules
jest.mock('firebase/functions');
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('@/firebaseConfig', () => ({
  auth: {},
  db: {},
  functions: {},
}));

describe('user.service.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('revokeMyRefreshTokens', () => {
    it('should call httpsCallable with correct function name', async () => {
      const mockCallable = jest.fn().mockResolvedValue({});
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      await revokeMyRefreshTokens();

      expect(httpsCallable).toHaveBeenCalledWith(expect.any(Object), 'revokeMyRefreshTokens');
      expect(mockCallable).toHaveBeenCalledWith({});
    });

    it('should silently fail on error', async () => {
      const mockError = new Error('Function error');
      const mockCallable = jest.fn().mockRejectedValue(mockError);
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      // Should not throw
      await expect(revokeMyRefreshTokens()).resolves.not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should log warning on failure', async () => {
      const mockError = new Error('Network error');
      const mockCallable = jest.fn().mockRejectedValue(mockError);
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      await revokeMyRefreshTokens();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[user.service] revokeMyRefreshTokens failed'),
        expect.any(Error)
      );
    });
  });

  describe('signUp', () => {
    it('should call createUserWithEmailAndPassword with correct params', async () => {
      const mockResponse = { user: { uid: 'test-uid' } };
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue(mockResponse);

      const result = await signUp('test@example.com', 'password123');

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.any(Object),
        'test@example.com',
        'password123'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw on auth error', async () => {
      const mockError = new Error('User already exists');
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValue(mockError);

      await expect(signUp('test@example.com', 'password123')).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });

    it('should preserve error code from Firebase', async () => {
      const firebaseError = new Error('Invalid email');
      (firebaseError as any).code = 'auth/invalid-email';
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValue(firebaseError);

      try {
        await signUp('invalid', 'password123');
      } catch (error: any) {
        expect(error.code).toBe('auth/invalid-email');
      }
    });
  });

  describe('createNewUserDoc', () => {
    it('should create user doc if it does not exist', async () => {
      const mockDocSnap = { exists: () => false };
      (getDoc as jest.Mock).mockResolvedValue(mockDocSnap);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await createNewUserDoc('test-uid');

      expect(doc).toHaveBeenCalledWith(expect.any(Object), 'users', 'test-uid');
      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });

    it('should not create doc if it already exists', async () => {
      const mockDocSnap = { exists: () => true };
      (getDoc as jest.Mock).mockResolvedValue(mockDocSnap);

      await createNewUserDoc('test-uid');

      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('should set createdAt and lastUpdatedAt timestamps', async () => {
      const mockDocSnap = { exists: () => false };
      (getDoc as jest.Mock).mockResolvedValue(mockDocSnap);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await createNewUserDoc('test-uid');

      const [_, data] = (setDoc as jest.Mock).mock.calls[0];
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('lastUpdatedAt');
    });

    it('should throw on error', async () => {
      const mockError = new Error('Database error');
      (getDoc as jest.Mock).mockRejectedValue(mockError);

      await expect(createNewUserDoc('test-uid')).rejects.toThrow(
        'Error creating new user document'
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('createUserDoc', () => {
    it('should create user doc with sanitized data', async () => {
      const userData = {
        email: 'Test@Example.COM',
        name: 'Test User',
        birthDate: '1990-01-01',
      };

      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await createUserDoc('test-uid', userData as any);

      expect(setDoc).toHaveBeenCalled();
      const [_, data] = (setDoc as jest.Mock).mock.calls[0];
      
      // Email should be lowercase
      expect(data.email).toBe('test@example.com');
      expect(data.isPremiumMember).toBe(false);
      expect(data.isEmailVerified).toBe(false);
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('lastUpdatedAt');
    });

    it('should sanitize data before writing', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      };

      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await createUserDoc('test-uid', userData as any);

      const [_, data] = (setDoc as jest.Mock).mock.calls[0];
      expect(data.name).toBe('Test User');
    });

    it('should throw on error', async () => {
      const userData = { email: 'test@example.com' };
      (setDoc as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(createUserDoc('test-uid', userData as any)).rejects.toThrow(
        'Error creating user document'
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('signIn', () => {
    it('should call signInWithEmailAndPassword with correct params', async () => {
      const mockResponse = { user: { uid: 'test-uid' } };
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue(mockResponse);

      const result = await signIn('test@example.com', 'password123');

      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.any(Object),
        'test@example.com',
        'password123'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw on auth error with message', async () => {
      const mockError = new Error('User not found');
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(mockError);

      await expect(signIn('test@example.com', 'password123')).rejects.toThrow(
        'User not found'
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('should use generic error message if no message provided', async () => {
      const mockError = new Error();
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(mockError);

      await expect(signIn('test@example.com', 'password123')).rejects.toThrow(
        'Auth error'
      );
    });
  });
});
