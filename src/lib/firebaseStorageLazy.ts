import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { app } from './firebase';

export const storage = getStorage(app);

export {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
};
