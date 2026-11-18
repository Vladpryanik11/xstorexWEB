-- UIDeviceFamily from the IPA (1 iPhone, 2 iPad), shown on the app page.
ALTER TABLE "AppVersion" ADD COLUMN "deviceFamily" INTEGER[] DEFAULT ARRAY[1]::INTEGER[];
