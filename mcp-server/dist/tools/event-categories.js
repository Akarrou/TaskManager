import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
import { getCurrentUserId } from '../services/user-auth.js';
/**
 * Default categories — these are built-in and cannot be modified via CRUD.
 * They are always returned alongside custom categories.
 */
const DEFAULT_CATEGORIES = [
    { key: 'meeting', label: 'Réunion', colorKey: 'blue', isDefault: true },
    { key: 'deadline', label: 'Échéance', colorKey: 'red', isDefault: true },
    { key: 'milestone', label: 'Jalon', colorKey: 'purple', isDefault: true },
    { key: 'reminder', label: 'Rappel', colorKey: 'yellow', isDefault: true },
    { key: 'personal', label: 'Personnel', colorKey: 'green', isDefault: true },
    { key: 'other', label: 'Autre', colorKey: 'indigo', isDefault: true },
];
/**
 * Available color keys for categories
 */
const VALID_COLOR_KEYS = ['blue', 'red', 'purple', 'yellow', 'green', 'gray', 'orange', 'teal', 'pink', 'indigo', 'cyan', 'rose'];
/**
 * Slugify a label to generate a category key
 * Matches Angular's key generation logic
 */
function slugify(label) {
    return label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}
/**
 * Register event category CRUD tools
 */
export function registerEventCategoryTools(server) {
    // =========================================================================
    // list_event_categories - List all event categories (default + custom)
    // =========================================================================
    server.registerTool('list_event_categories', {
        description: `List all event categories including built-in defaults and user-created custom categories. Default categories (meeting, deadline, milestone, reminder, personal, other) are always included and cannot be deleted. Custom categories are per-user and stored in the event_categories table. Each category has a key (used in event creation), label (display name), colorKey (from palette: blue, red, purple, yellow, green, gray, orange, teal, pink, indigo, cyan, rose), and isDefault flag. Use category keys when creating or updating events via create_event/update_event.`,
        annotations: { readOnlyHint: true },
    }, async () => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const { data: customCategories, error } = await supabase
                .from('event_categories')
                .select('*')
                .eq('user_id', userId)
                .order('sort_order', { ascending: true });
            if (error) {
                return {
                    content: [{ type: 'text', text: 'Error fetching categories. Please try again.' }],
                    isError: true,
                };
            }
            const custom = (customCategories || []).map((c) => ({
                key: c.key,
                label: c.label,
                colorKey: c.color_key,
                isDefault: false,
                sortOrder: c.sort_order,
            }));
            const allCategories = [...DEFAULT_CATEGORIES, ...custom];
            return {
                content: [{ type: 'text', text: `Found ${allCategories.length} categories (${DEFAULT_CATEGORIES.length} default + ${custom.length} custom):\n${JSON.stringify(allCategories, null, 2)}\n\nAvailable color keys: ${VALID_COLOR_KEYS.join(', ')}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // create_event_category - Create a custom event category
    // =========================================================================
    server.registerTool('create_event_category', {
        description: `Create a new custom event category. The key is auto-generated from the label using slugification (lowercase, remove diacritics, replace non-alphanumeric with hyphens). The colorKey must be one of the available palette colors: blue, red, purple, yellow, green, gray, orange, teal, pink, indigo, cyan, rose. Custom categories are per-user and can be used in create_event/update_event just like default categories. Cannot create categories with keys that conflict with default categories (meeting, deadline, milestone, reminder, personal, other).`,
        inputSchema: {
            label: z.string().min(1).describe('Display name for the category (e.g., "Team standup", "Client call").'),
            color_key: z.enum(['blue', 'red', 'purple', 'yellow', 'green', 'gray', 'orange', 'teal', 'pink', 'indigo', 'cyan', 'rose']).describe('Color key from the palette.'),
        },
    }, async ({ label, color_key }) => {
        try {
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const key = slugify(label);
            // Check for conflicts with default categories
            if (DEFAULT_CATEGORIES.some(c => c.key === key)) {
                return {
                    content: [{ type: 'text', text: `Cannot create category: key "${key}" conflicts with a default category.` }],
                    isError: true,
                };
            }
            // Check for existing custom category with same key
            const { data: existing } = await supabase
                .from('event_categories')
                .select('key')
                .eq('user_id', userId)
                .eq('key', key)
                .maybeSingle();
            if (existing) {
                return {
                    content: [{ type: 'text', text: `Category with key "${key}" already exists. Use update_event_category to modify it.` }],
                    isError: true,
                };
            }
            // Get next sort order
            const { data: maxOrder } = await supabase
                .from('event_categories')
                .select('sort_order')
                .eq('user_id', userId)
                .order('sort_order', { ascending: false })
                .limit(1)
                .maybeSingle();
            const sortOrder = (maxOrder?.sort_order || 0) + 1;
            const { data, error } = await supabase
                .from('event_categories')
                .insert({
                user_id: userId,
                key,
                label,
                color_key,
                sort_order: sortOrder,
            })
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: 'Error creating category. Please try again.' }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Category created successfully:\n${JSON.stringify({ key: data.key, label: data.label, colorKey: data.color_key, isDefault: false, sortOrder: data.sort_order }, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_event_category - Update a custom event category
    // =========================================================================
    server.registerTool('update_event_category', {
        description: `Update an existing custom event category. Only custom categories can be updated — default categories (meeting, deadline, milestone, reminder, personal, other) cannot be modified. You can update the label, color_key, or both. At least one update field must be provided.`,
        inputSchema: {
            key: z.string().describe('The key of the custom category to update (e.g., "team-standup").'),
            label: z.string().min(1).optional().describe('New display name for the category.'),
            color_key: z.enum(['blue', 'red', 'purple', 'yellow', 'green', 'gray', 'orange', 'teal', 'pink', 'indigo', 'cyan', 'rose']).optional().describe('New color key from the palette.'),
        },
        annotations: { idempotentHint: true },
    }, async ({ key, label, color_key }) => {
        try {
            if (label === undefined && color_key === undefined) {
                return {
                    content: [{ type: 'text', text: 'No updates provided. Please specify label and/or color_key.' }],
                    isError: true,
                };
            }
            // Block updates to default categories
            if (DEFAULT_CATEGORIES.some(c => c.key === key)) {
                return {
                    content: [{ type: 'text', text: `Cannot update default category "${key}". Only custom categories can be modified.` }],
                    isError: true,
                };
            }
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const updateData = { updated_at: new Date().toISOString() };
            if (label !== undefined)
                updateData.label = label;
            if (color_key !== undefined)
                updateData.color_key = color_key;
            const { data, error } = await supabase
                .from('event_categories')
                .update(updateData)
                .eq('user_id', userId)
                .eq('key', key)
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating category. Make sure the key "${key}" exists.` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Category updated:\n${JSON.stringify({ key: data.key, label: data.label, colorKey: data.color_key, isDefault: false }, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // delete_event_category - Delete a custom event category
    // =========================================================================
    server.registerTool('delete_event_category', {
        description: `Delete a custom event category. Only custom categories can be deleted — default categories (meeting, deadline, milestone, reminder, personal, other) cannot be removed. Events using this category will keep their current category value but it will no longer appear in the category list. Consider updating those events to use a different category.`,
        inputSchema: {
            key: z.string().describe('The key of the custom category to delete (e.g., "team-standup").'),
        },
        annotations: { destructiveHint: true },
    }, async ({ key }) => {
        try {
            // Block deletion of default categories
            if (DEFAULT_CATEGORIES.some(c => c.key === key)) {
                return {
                    content: [{ type: 'text', text: `Cannot delete default category "${key}". Only custom categories can be deleted.` }],
                    isError: true,
                };
            }
            const userId = getCurrentUserId();
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('event_categories')
                .delete()
                .eq('user_id', userId)
                .eq('key', key);
            if (error) {
                return {
                    content: [{ type: 'text', text: 'Error deleting category. Please try again.' }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Category "${key}" deleted successfully. Note: existing events with this category will keep their value but the category will no longer appear in listings.` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=event-categories.js.map