import { CommandDefinition } from '../types';

export const helpCommand: CommandDefinition = {
  name: 'help',
  description: 'Show available commands and usage.',
  usage: '?help',
  async execute({ message }) {
    const lines = [
      '**Dossier Bot Commands**',
      '`?config forum #channel` — admins: set the forum that stores dossiers (bot locks posting).',
      '`?add "Person Name" --summary "Short summary"` — create a person dossier thread.',
      '`?who Person` — fetch summary & dossier link.',
      '`?help` — display this help.',
      '',
      'Threads are bot-managed. Users cannot post directly; use commands or the web editor.',
    ];

    await message.reply({
      content: lines.join('\n'),
      allowedMentions: { repliedUser: false },
    });
  },
};
