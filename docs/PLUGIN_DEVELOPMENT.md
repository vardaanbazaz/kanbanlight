# KanbanLight Plugin Development Guide

## Overview

KanbanLight supports WebAssembly (WASM) plugins that extend core functionality while maintaining security through sandboxed execution. Plugins can hook into board events, create custom commands, and interact with the board API.

## Plugin Architecture

### Security Model
- **Sandboxed Execution**: Plugins run in WebAssembly with no direct access to DOM or network
- **Controlled API**: Limited, well-defined interface for board operations
- **Memory Management**: Plugins manage their own memory allocation/deallocation
- **Hook-based Events**: Plugins respond to specific board events

### Plugin Structure

A KanbanLight plugin consists of:
1. **WASM Module**: Compiled WebAssembly binary
2. **Manifest**: JSON metadata describing the plugin
3. **Exports**: Required functions (`init`, `execute`, `malloc`, `free`)

## Required Exports

Every plugin must export these functions:

```c
// Initialize plugin (called once on load)
void init();

// Execute plugin logic (called for each hook)
void execute(char* data, int length);

// Memory management
void* malloc(int size);
void free(void* ptr);
```

## Available Hooks

Plugins can register for these board events:

- `onCardCreate`: Triggered when a new card is created
- `onCardMove`: Triggered when a card moves between columns
- `onCardUpdate`: Triggered when card properties change
- `onBoardLoad`: Triggered when a board is loaded
- `onColumnCreate`: Triggered when a new column is added

## Plugin API

Plugins can call these functions through the WASM import interface:

### Card Operations
```c
// Create a new card
int create_card(char* card_json, int length);

// Update existing card
void update_card(char* card_id, char* updates_json, int id_len, int updates_len);

// Delete a card
void delete_card(char* card_id, int length);
```

### UI Operations
```c
// Show notification to user
void show_notification(char* message, int length, int type);
// Types: 0=info, 1=success, 2=warning, 3=error

// Register custom command in command palette
void register_command(char* id, char* title, int id_len, int title_len);
```

### Utility Functions
```c
// Log message to console
void log(char* message, int length);
```

## Example Plugin (C)

Here's a simple plugin that auto-assigns high-priority cards:

```c
#include <stdlib.h>
#include <string.h>

// Import functions from host
extern void log(char* message, int length);
extern void show_notification(char* message, int length, int type);
extern int create_card(char* card_json, int length);

// Required exports
void init() {
    char* msg = "Auto-assign plugin initialized";
    log(msg, strlen(msg));
}

void execute(char* data, int length) {
    // Parse hook data (simplified)
    if (strstr(data, "onCardCreate")) {
        // Check if card is high priority
        if (strstr(data, "\"priority\":\"high\"")) {
            // Auto-assign to team lead
            char* notification = "High-priority card auto-assigned to team lead";
            show_notification(notification, strlen(notification), 1);
        }
    }
}

void* malloc(int size) {
    return malloc(size);
}

void free(void* ptr) {
    free(ptr);
}
```

## Building Plugins

### Using Emscripten (C/C++)

```bash
# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest

# Compile plugin
emcc plugin.c -o plugin.wasm \
  -s EXPORTED_FUNCTIONS='["_init","_execute","_malloc","_free"]' \
  -s NO_EXIT_RUNTIME=1 \
  -s ALLOW_MEMORY_GROWTH=1
```

### Using AssemblyScript (TypeScript-like)

```typescript
// plugin.ts
export function init(): void {
  console.log("Plugin initialized");
}

export function execute(dataPtr: i32, length: i32): void {
  const data = String.UTF8.decode(dataPtr, length);
  const hookData = JSON.parse(data);
  
  if (hookData.hook === "onCardCreate") {
    // Plugin logic here
  }
}

export { memory };
```

```bash
# Compile with AssemblyScript
npm install -g assemblyscript
asc plugin.ts -o plugin.wasm --exportRuntime
```

### Using Rust

```rust
// lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn log(ptr: *const u8, len: usize);
    fn show_notification(ptr: *const u8, len: usize, msg_type: i32);
}

#[wasm_bindgen]
pub fn init() {
    let msg = "Rust plugin initialized";
    unsafe {
        log(msg.as_ptr(), msg.len());
    }
}

#[wasm_bindgen]
pub fn execute(data: &str) {
    // Plugin logic
    if data.contains("onCardCreate") {
        let notification = "Card created by Rust plugin";
        unsafe {
            show_notification(notification.as_ptr(), notification.len(), 1);
        }
    }
}
```

```bash
# Build with wasm-pack
wasm-pack build --target web --out-dir pkg
```

## Plugin Manifest

Create a `manifest.json` file alongside your WASM:

```json
{
  "id": "auto-assign-plugin",
  "name": "Auto Assign Plugin",
  "version": "1.0.0",
  "description": "Automatically assigns high-priority cards",
  "author": "Your Name",
  "hooks": {
    "onCardCreate": "handle_card_create",
    "onCardMove": "handle_card_move"
  },
  "permissions": [
    "cards:read",
    "cards:write",
    "notifications:show"
  ]
}
```

## Installation

1. Build your plugin to generate a `.wasm` file
2. Open KanbanLight and click the Plugin Manager
3. Select your `.wasm` file
4. The plugin will be validated and installed
5. Enable/disable plugins as needed

## Best Practices

### Performance
- Keep plugins lightweight - they run on every hook
- Use efficient algorithms for data processing
- Minimize memory allocations

### Security
- Never trust input data - validate everything
- Use safe string operations to prevent buffer overflows
- Don't attempt to access unauthorized APIs

### User Experience
- Provide clear notifications for plugin actions
- Register meaningful command palette entries
- Handle errors gracefully

### Development
- Test plugins thoroughly with various board states
- Use descriptive logging for debugging
- Follow semantic versioning for updates

## Debugging

Enable plugin debugging in the browser console:

```javascript
// Enable plugin debug logging
localStorage.setItem('kanban-plugin-debug', 'true');

// View plugin events
window.addEventListener('plugin-event', (e) => {
  console.log('Plugin event:', e.detail);
});
```

## Advanced Examples

### Workflow Automation Plugin
```c
// Auto-move cards based on conditions
void execute(char* data, int length) {
    if (strstr(data, "onCardUpdate")) {
        // If card marked as "ready for review"
        if (strstr(data, "ready_for_review")) {
            // Move to review column
            char* move_data = "{\"columnId\":\"review\"}";
            // Implementation would call update_card
        }
    }
}
```

### Analytics Plugin
```c
// Track card metrics
void execute(char* data, int length) {
    if (strstr(data, "onCardMove")) {
        // Log timing data
        char* log_msg = "Card moved - updating metrics";
        log(log_msg, strlen(log_msg));
        
        // Could integrate with external analytics
    }
}
```

### Integration Plugin
```c
// Sync with external tools
void execute(char* data, int length) {
    if (strstr(data, "onCardCreate")) {
        // Create corresponding ticket in external system
        char* notification = "Synced with external system";
        show_notification(notification, strlen(notification), 1);
    }
}
```

## Plugin Distribution

Consider these distribution methods:

1. **Direct WASM files**: Users upload `.wasm` files directly
2. **Plugin registry**: Centralized repository of verified plugins
3. **Git-based**: Plugins distributed via Git repositories
4. **Package managers**: Integration with npm, cargo, etc.

## Future Enhancements

Planned plugin system improvements:

- **Hot reloading**: Update plugins without restart
- **Plugin marketplace**: Discover and install plugins
- **Advanced permissions**: Fine-grained access control
- **Plugin communication**: Inter-plugin messaging
- **Native modules**: Support for native code plugins
- **Visual plugin builder**: GUI for creating simple plugins

This plugin system positions KanbanLight as a truly extensible platform while maintaining security and performance through WebAssembly sandboxing.