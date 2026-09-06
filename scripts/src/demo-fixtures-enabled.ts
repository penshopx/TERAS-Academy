import { allowsDemoFixtures } from "@workspace/db/demo-access";

process.stdout.write(allowsDemoFixtures() ? "1\n" : "0\n");