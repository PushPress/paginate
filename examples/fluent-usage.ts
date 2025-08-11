// Examples of the new fluent interface usage

import { paginate, type PaginationCallback } from '../src/index';

// Sample data and callback for examples
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', isActive: true, age: 25 },
  { id: 2, name: 'Bob', email: 'bob@example.com', isActive: false, age: 30 },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', isActive: true, age: 35 },
  { id: 4, name: 'Diana', email: 'diana@example.com', isActive: true, age: 28 },
  { id: 5, name: 'Eve', email: 'eve@example.com', isActive: false, age: 32 },
];

const getUsersCallback: PaginationCallback<typeof users[0]> = async ({ limit, offset = 0 }) => {
  const pageItems = users.slice(offset, offset + limit);
  return {
    items: pageItems,
    pageInfo: {
      hasNextPage: offset + limit < users.length,
    },
  };
};

// Example 1: Traditional async iteration (still works!)
async function traditionalUsage() {
  console.log('=== Traditional async iteration ===');
  
  for await (const user of paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })) {
    console.log(`User: ${user.name} (${user.email})`);
  }
}

// Example 2: Fluent interface - no wrap() needed!
async function fluentUsage() {
  console.log('\n=== Fluent interface ===');
  
  // Clean, readable fluent chain
  const activeUserEmails = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .filter(user => user.isActive)
    .map(user => user.email.toLowerCase())
    .toArray();
  
  console.log('Active user emails:', activeUserEmails);
}

// Example 3: Mixed usage - fluent + for-await
async function mixedUsage() {
  console.log('\n=== Mixed usage ===');
  
  // Use fluent methods to filter, then iterate manually
  const activeUsers = paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .filter(user => user.isActive)
    .filter(user => user.age >= 30);
  
  // Then use traditional iteration
  for await (const user of activeUsers) {
    console.log(`Mature active user: ${user.name}, age ${user.age}`);
  }
}

// Example 4: Complex data processing pipeline
async function complexPipeline() {
  console.log('\n=== Complex pipeline ===');
  
  // Find the average age of active users
  const avgAge = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .filter(user => user.isActive)
    .map(user => user.age)
    .reduce((sum, age, index) => {
      return index === 0 ? age : (sum * index + age) / (index + 1);
    }, 0);
  
  console.log('Average age of active users:', avgAge);
}

// Example 5: Creating lookup structures
async function createLookups() {
  console.log('\n=== Creating lookups ===');
  
  // Create a Map of users by ID
  const userMap = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .filter(user => user.isActive)
    .toMap(user => user.id);
  
  console.log('Active users by ID:', Object.fromEntries(userMap.entries()));
  
  // Get unique domains from emails
  const emailDomains = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .map(user => user.email.split('@')[1])
    .toSet();
  
  console.log('Email domains:', Array.from(emailDomains));
}

// Example 6: Early termination patterns
async function earlyTermination() {
  console.log('\n=== Early termination ===');
  
  // Find first user over 30
  const firstMatureUser = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .find(user => user.age > 30);
  
  console.log('First user over 30:', firstMatureUser?.name);
  
  // Check if any users are inactive
  const hasInactiveUsers = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .some(user => !user.isActive);
  
  console.log('Has inactive users:', hasInactiveUsers);
  
  // Take only first 3 users
  const firstThree = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .take(3)
    .toArray();
  
  console.log('First 3 users:', firstThree.map(u => u.name));
}

// Example 7: Async transforms and predicates
async function asyncOperations() {
  console.log('\n=== Async operations ===');
  
  // Simulate async operations
  const enrichUsers = await paginate(getUsersCallback, {
    strategy: 'offset',
    limit: 2,
    errorPolicy: { type: 'throw' }
  })
    .filter(async (user) => {
      // Simulate async validation
      await new Promise(resolve => setTimeout(resolve, 10));
      return user.isActive;
    })
    .map(async (user) => {
      // Simulate async enrichment
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        ...user,
        displayName: `${user.name} (${user.age} years old)`,
        emailDomain: user.email.split('@')[1]
      };
    })
    .toArray();
  
  console.log('Enriched users:', enrichUsers.map(u => u.displayName));
}

// Example 8: Error handling with fluent interface
async function errorHandling() {
  console.log('\n=== Error handling ===');
  
  // This still works with error policies
  const resilientProcessing = await paginate(async ({ limit, offset = 0 }) => {
    if (offset === 2) {
      throw new Error('Simulated error');
    }
    const pageItems = users.slice(offset, offset + limit);
    return {
      items: pageItems,
      pageInfo: { hasNextPage: offset + limit < users.length },
    };
  }, {
    strategy: 'offset',
    limit: 1,
    errorPolicy: { 
      type: 'continue',
      maxErrorCount: 2
    }
  })
    .filter(user => user.isActive)
    .map(user => user.name)
    .toArray();
  
  console.log('Users processed despite errors:', resilientProcessing);
}

// Run all examples
async function runExamples() {
  await traditionalUsage();
  await fluentUsage();
  await mixedUsage();
  await complexPipeline();
  await createLookups();
  await earlyTermination();
  await asyncOperations();
  await errorHandling();
}

// Export for potential usage
export {
  runExamples,
  traditionalUsage,
  fluentUsage,
  mixedUsage,
  complexPipeline,
  createLookups,
  earlyTermination,
  asyncOperations,
  errorHandling
};