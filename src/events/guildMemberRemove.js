const { recordLeave } = require('../database');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
            // Record the leave in database (guild-aware)
            recordLeave(member.guild.id, member.id, member.user.tag);
            console.log(`[Leave] ${member.user.tag} left ${member.guild.name}`);
        } catch (error) {
            console.error('[Leave] Error recording member leave:', error);
        }
    }
};
