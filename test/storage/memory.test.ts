import { createMemoryBacking, memoryStorage } from '../../src/storage/memory';
import { storageContract } from './contract';

storageContract('memory', () => {
  const backing = createMemoryBacking();
  return { connect: () => memoryStorage(backing) };
});
