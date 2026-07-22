/**
 * Mission Engine - Xử lý sự kiện nhiệm vụ
 */
const pool = require('../../db');

async function trackMissionProgress(userId, actionType, count = 1) {
    if (!userId || !actionType) return [];
    const newlyCompleted = [];

    try {
        const missions = await pool.query(
            `SELECT id, target_value, cycle, reward_lt, reward_exp, name
             FROM missions_config 
             WHERE is_active = true AND action_type = $1`,
            [actionType]
        );

        for (const mission of missions.rows) {
            const existing = await pool.query(
                'SELECT id, current_progress, status FROM user_missions WHERE user_id = $1 AND mission_config_id = $2',
                [userId, mission.id]
            );

            if (existing.rows.length > 0) {
                const um = existing.rows[0];
                if (um.status === 'COMPLETED' || um.status === 'CLAIMED') continue;

                const newProgress = Math.min(parseInt(um.current_progress) + count, mission.target_value);
                const newStatus = newProgress >= mission.target_value ? 'COMPLETED' : 'IN_PROGRESS';

                await pool.query(
                    'UPDATE user_missions SET current_progress = $1, status = $2 WHERE id = $3',
                    [newProgress, newStatus, um.id]
                );

                if (newStatus === 'COMPLETED' && um.status === 'IN_PROGRESS') {
                    newlyCompleted.push({
                        id: mission.id,
                        name: mission.name || mission.action_type,
                        reward_lt: mission.reward_lt,
                        reward_exp: mission.reward_exp
                    });
                }
            } else {
                const newProgress = Math.min(count, mission.target_value);
                const newStatus = newProgress >= mission.target_value ? 'COMPLETED' : 'IN_PROGRESS';

                await pool.query(
                    'INSERT INTO user_missions (user_id, mission_config_id, current_progress, status) VALUES ($1, $2, $3, $4)',
                    [userId, mission.id, newProgress, newStatus]
                );

                if (newStatus === 'COMPLETED') {
                    newlyCompleted.push({
                        id: mission.id,
                        name: mission.name || mission.action_type,
                        reward_lt: mission.reward_lt,
                        reward_exp: mission.reward_exp
                    });
                }
            }
        }
    } catch (err) {
        console.error('[trackMissionProgress] Error:', err.message);
    }
    return newlyCompleted;
}

module.exports = { trackMissionProgress };