const { recordJoin } = require('../database');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            // Record the join in database (guild-aware)
            recordJoin(member.guild.id, member.id, member.user.tag);
            console.log(`[Join] ${member.user.tag} joined ${member.guild.name}`);
        } catch (error) {
            console.error('[Join] Error recording member join:', error);
        }
    }
};
