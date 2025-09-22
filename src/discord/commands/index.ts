import { addPersonCommand } from './addPerson';
import { configForumCommand } from './configForum';
import { helpCommand } from './help';
import { whoCommand } from './who';

export const commands = [
  addPersonCommand,
  configForumCommand,
  whoCommand,
  helpCommand,
];
