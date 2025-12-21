import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all user-related tools
 */
export function registerUserTools(server) {
    // =========================================================================
    // list_users - List all users in the system
    // =========================================================================
    server.tool('list_users', 'List all users in the system. Uses the get_all_users RPC function.', {}, async () => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase.rpc('get_all_users');
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error listing users: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_user - Get a specific user by ID
    // =========================================================================
    server.tool('get_user', 'Get detailed information about a specific user by their ID.', {
        user_id: z.string().uuid().describe('The UUID of the user'),
    }, async ({ user_id }) => {
        try {
            const supabase = getSupabaseClient();
            // Use auth.admin to get user details (requires service role)
            const { data, error } = await supabase.auth.admin.getUserById(user_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error getting user: ${error.message}` }],
                    isError: true,
                };
            }
            // Return sanitized user data
            const userData = {
                id: data.user.id,
                email: data.user.email,
                created_at: data.user.created_at,
                updated_at: data.user.updated_at,
                last_sign_in_at: data.user.last_sign_in_at,
                user_metadata: data.user.user_metadata,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(userData, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_profile - Get a user's profile
    // =========================================================================
    server.tool('get_profile', 'Get a user\'s profile information from the profiles table.', {
        user_id: z.string().uuid().describe('The UUID of the user'),
    }, async ({ user_id }) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user_id)
                .single();
            if (error) {
                // If no profile exists, try to get user data from auth
                if (error.code === 'PGRST116') {
                    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
                    if (userError) {
                        return {
                            content: [{ type: 'text', text: `No profile found and error getting user: ${userError.message}` }],
                            isError: true,
                        };
                    }
                    return {
                        content: [{ type: 'text', text: JSON.stringify({
                                    id: userData.user.id,
                                    email: userData.user.email,
                                    display_name: userData.user.user_metadata?.display_name || null,
                                    avatar_url: userData.user.user_metadata?.avatar_url || null,
                                    note: 'Profile not found in profiles table, showing auth user data'
                                }, null, 2) }],
                    };
                }
                return {
                    content: [{ type: 'text', text: `Error getting profile: ${error.message}` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // update_profile - Update a user's profile
    // =========================================================================
    server.tool('update_profile', 'Update a user\'s profile information. Can update display name, avatar URL, or other metadata.', {
        user_id: z.string().uuid().describe('The UUID of the user to update'),
        display_name: z.string().min(1).max(100).optional().describe('New display name'),
        avatar_url: z.string().url().optional().describe('New avatar URL'),
        metadata: z.record(z.unknown()).optional().describe('Additional metadata to store'),
    }, async ({ user_id, display_name, avatar_url, metadata }) => {
        try {
            const supabase = getSupabaseClient();
            const updates = {
                updated_at: new Date().toISOString(),
            };
            if (display_name !== undefined)
                updates.display_name = display_name;
            if (avatar_url !== undefined)
                updates.avatar_url = avatar_url;
            if (metadata !== undefined)
                updates.metadata = metadata;
            if (Object.keys(updates).length === 1) { // Only updated_at
                return {
                    content: [{ type: 'text', text: 'No updates provided. Please specify at least one field to update.' }],
                    isError: true,
                };
            }
            // Try to update profile table first
            const { data, error } = await supabase
                .from('profiles')
                .upsert({ id: user_id, ...updates })
                .select()
                .single();
            if (error) {
                return {
                    content: [{ type: 'text', text: `Error updating profile: ${error.message}` }],
                    isError: true,
                };
            }
            // Also update user metadata in auth if display_name or avatar_url changed
            if (display_name !== undefined || avatar_url !== undefined) {
                const userMetadata = {};
                if (display_name !== undefined)
                    userMetadata.display_name = display_name;
                if (avatar_url !== undefined)
                    userMetadata.avatar_url = avatar_url;
                await supabase.auth.admin.updateUserById(user_id, {
                    user_metadata: userMetadata,
                });
            }
            return {
                content: [{ type: 'text', text: `Profile updated successfully:\n${JSON.stringify(data, null, 2)}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=users.js.map