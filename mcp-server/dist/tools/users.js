import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase-client.js';
/**
 * Register all user-related tools
 */
export function registerUserTools(server) {
    // =========================================================================
    // list_users - List all users in the system
    // =========================================================================
    server.registerTool('list_users', {
        description: `List all users registered in the system. Returns basic user info (id, email). Requires service role access. Use this to find user IDs for assigning tasks, adding project members, or attributing comments. Related tools: get_user (details), get_profile (profile data), update_profile.`,
        annotations: { readOnlyHint: true },
    }, async () => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase.rpc('get_all_users');
            if (error) {
                return {
                    content: [{ type: 'text', text: 'Error listing users. Please try again.' }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // get_user - Get a specific user by ID
    // =========================================================================
    server.registerTool('get_user', {
        description: `Get detailed auth information about a user from Supabase Auth. Returns: id, email, created_at, updated_at, last_sign_in_at, and user_metadata. Requires service role access. For profile-specific data (display_name, avatar), use get_profile instead. Related tools: get_profile, update_profile, list_users.`,
        inputSchema: {
            user_id: z.string().uuid().describe('The user UUID. Get this from list_users or project members.'),
        },
        annotations: { readOnlyHint: true },
    }, async ({ user_id }) => {
        try {
            const supabase = getSupabaseClient();
            // Use auth.admin to get user details (requires service role)
            const { data, error } = await supabase.auth.admin.getUserById(user_id);
            if (error) {
                return {
                    content: [{ type: 'text', text: 'Error getting user. Please try again.' }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
    // =========================================================================
    // get_profile - Get a user's profile
    // =========================================================================
    server.registerTool('get_profile', {
        description: `Get a user's profile data from the profiles table. Returns display_name, avatar_url, and custom metadata. If no profile exists, falls back to auth user_metadata. Profiles are for user-facing information (display names, avatars) while auth user data is for authentication. Related tools: update_profile, get_user (auth data).`,
        inputSchema: {
            user_id: z.string().uuid().describe('The user UUID to get profile for.'),
        },
        annotations: { readOnlyHint: true },
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
                            content: [{ type: 'text', text: 'No profile found and user not accessible.' }],
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
                    content: [{ type: 'text', text: 'Error getting profile. Please try again.' }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
    // update_profile - Update a user's profile
    // =========================================================================
    server.registerTool('update_profile', {
        description: `Update a user's profile information. Creates the profile if it doesn't exist (upsert). Also syncs display_name and avatar_url to Supabase Auth user_metadata. Only provide fields you want to change. At least one field must be specified. Related tools: get_profile, get_user.`,
        inputSchema: {
            user_id: z.string().uuid().describe('The user UUID to update.'),
            display_name: z.string().min(1).max(100).optional().describe('New display name shown in the UI.'),
            avatar_url: z.string().url().optional().describe('New avatar image URL. Must be a valid URL.'),
            metadata: z.record(z.unknown()).optional().describe('Custom metadata object to store (merged with existing).'),
        },
        annotations: { idempotentHint: true },
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
                    content: [{ type: 'text', text: 'Error updating profile. Please try again.' }],
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
                content: [{ type: 'text', text: 'An unexpected error occurred. Please try again.' }],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=users.js.map