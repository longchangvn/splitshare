-- SplitShare sample seed: group "monthly test" (10 accounts, 10 equal-split expenses)
-- Generated: 2026-10-17 21:38:34 UTC via localhost API (localhost:8082 -> local PostgreSQL splitshare),
-- extracted to T-SQL. Table order = FK-dependency order.
-- Schema comes from the 20261017001736_Baseline migration (splitshare schema).
-- Timestamps normalized to UTC; booleans as 1/0 (bit); no IDENTITY columns.
-- Re-running is a no-op (sentinel guard below); a failed run rolls back fully.
--
-- Accounts (email => password):
--   khanhnguyen@gmail.com => khanhnguyen@123    mytruong@gmail.com => mytruong@123
--   duytruong@gmail.com => duytruong@123        sendoan@gmail.com => sendoan@123
--   khanhkevin@gmail.com => khanhkevin@123      nhatle@gmail.com => nhatle@123
--   thinh@gmail.com => thinh@1234               tuan@gmail.com => tuan@1234
--   tramd@gmail.com => tram@1234                uyen@gmail.com => uyen@1234
--   (usernames equal the email local part; display names are display-name guesses)
--
-- Group "monthly test" (USD): $803.60 across 10 expenses, each split equally
-- ($80.36 per member gross share). No receipts/images, no payments, no settlement
-- plans (the API computes the settlement on first view).
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM splitshare.[Users] WHERE [Email] = N'khanhnguyen@gmail.com')
BEGIN
    PRINT 'Seed already applied (khanhnguyen@gmail.com exists) - nothing to do.';
END
ELSE
BEGIN
    BEGIN TRANSACTION;

    INSERT INTO splitshare.[Users] ([Id], [DisplayName], [Username], [Email], [Phone], [PasswordHash], [GoogleSub], [CreatedAt], [EmailVerifiedAt], [FailedLoginAttempts], [LockedUntilUtc]) VALUES
    ('9e9f407c-0466-44ab-926c-05d29b202350', N'Duy Truong', N'duytruong', N'duytruong@gmail.com', NULL, N'210000.DYA6z7He4j71lvIiyvaufw==.7cpiuI+nOAC/jYvibYfY2jPf/Re9/7k1K0RW4CNGCiw=', NULL, '2026-10-17T21:30:43.164891', NULL, 0, NULL),
    ('fbea964c-932d-43d0-be7c-5e8f42d7f526', N'Kevin Khanh', N'khanhkevin', N'khanhkevin@gmail.com', NULL, N'210000.qDrzBLxFP/GM3k9BO6PJCg==.u1xlwCfZuMi6jE3Ae8hTstMFNvnnd1O0rhp+Yem5szA=', NULL, '2026-10-17T21:31:13.317219', NULL, 0, NULL),
    ('ebd66cb3-403a-4a35-96e4-fd6ab224f18b', N'Khanh Nguyen', N'khanhnguyen', N'khanhnguyen@gmail.com', NULL, N'210000.TMLPEgrwdo9apBAYfedN9g==.k1iss6W4EkjvM5hvO2WBn6ag2KuYiIA6J0FqOxwxlWw=', NULL, '2026-10-17T21:30:12.890803', NULL, 0, NULL),
    ('3d27fb27-1368-4625-8f5c-222e6ff0f6da', N'My Truong', N'mytruong', N'mytruong@gmail.com', NULL, N'210000.wDu8nlLj2T/VYVmSbeGwgw==.QGrP3qe0dbwdzZkcALhxDFCGw37CqCEs4ATukAtjnnE=', NULL, '2026-10-17T21:30:28.079526', NULL, 0, NULL),
    ('cada6148-55f7-43c2-b828-827b0d53a844', N'Nhat Le', N'nhatle', N'nhatle@gmail.com', NULL, N'210000.PTx6B6ddgDEMNVUxh+IwbA==.05o4TNnfQ+yquSkLEyteOz445nf98dOSNwNJBvcBG5Y=', NULL, '2026-10-17T21:31:28.395513', NULL, 0, NULL),
    ('cbf93329-5655-47d1-9eb0-5ed0015fb52d', N'Se Doan', N'sendoan', N'sendoan@gmail.com', NULL, N'210000.VdxmBKZTKIfNokWaOWnDjg==.FK6uwL+BzT1GTYphJxfelRrNuM+X58ZpmdSE5lF1Iyk=', NULL, '2026-10-17T21:30:58.239738', NULL, 0, NULL),
    ('4a5a6ccd-2fc6-466c-b389-172047b40e9c', N'Thinh', N'thinh', N'thinh@gmail.com', NULL, N'210000.exIOW8KFHd8FiOljW3/DFA==.3pb+rIaqnVuk7ZotERBi0pZXzBsJA/xwNZQiZ/WjjWs=', NULL, '2026-10-17T21:31:43.472486', NULL, 0, NULL),
    ('6f9613c6-877f-4050-af44-6e1bc6fd3c43', N'Tram', N'tramd', N'tramd@gmail.com', NULL, N'210000.eOceSSeEV++txsgLmedNuw==.Z45KlhTj08A/62s8weQsQGbg+btuidSgQf31WAntFZI=', NULL, '2026-10-17T21:32:13.622431', NULL, 0, NULL),
    ('af93d2bf-6065-4f11-9f82-93414ffc5900', N'Tuan', N'tuan', N'tuan@gmail.com', NULL, N'210000.g1vxguvhYj6Xd56lJWtLWA==.VHfZSCHAqkqU7MO1UCrC81Q9iwV9R+KIAUraL1E+hfE=', NULL, '2026-10-17T21:31:58.552707', NULL, 0, NULL),
    ('025a9a78-98d8-4261-a3d1-9550e710fe23', N'Uyen', N'uyen', N'uyen@gmail.com', NULL, N'210000.FeLQxAUUda7MNrdi6PnMWw==.w7NNM47XO6Npx682+pOktY5ng6B+qrnxepOfixWDDik=', NULL, '2026-10-17T21:32:28.694059', NULL, 0, NULL);
    PRINT 'Users: 10 rows';

    INSERT INTO splitshare.[Groups] ([Id], [Name], [Currency], [InviteToken], [CreatedBy], [CreatedAt], [DeletedAt], [BudgetCents], [BudgetAlertPct], [Mode], [FlatFeeCents], [ShareToken]) VALUES
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'monthly test', N'USD', N'8BD3BECB85E6122E5E04FE0618BBBD36F14D92530B45A0916D27D73453BB8A7C', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', '2026-10-17T21:32:28.903774', NULL, NULL, 80, N'shared', NULL, NULL);
    PRINT 'Groups: 1 rows';

    INSERT INTO splitshare.[GroupMembers] ([GroupId], [UserId], [Role], [JoinedAt], [DepositPaid]) VALUES
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', '025a9a78-98d8-4261-a3d1-9550e710fe23', N'member', '2026-10-17T21:32:28.965002', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', N'member', '2026-10-17T21:32:28.954835', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', N'member', '2026-10-17T21:32:28.961888', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', N'member', '2026-10-17T21:32:28.964043', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', '9e9f407c-0466-44ab-926c-05d29b202350', N'member', '2026-10-17T21:32:28.956050', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', 'af93d2bf-6065-4f11-9f82-93414ffc5900', N'member', '2026-10-17T21:32:28.963130', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', 'cada6148-55f7-43c2-b828-827b0d53a844', N'member', '2026-10-17T21:32:28.960395', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', N'member', '2026-10-17T21:32:28.957247', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', N'owner', '2026-10-17T21:32:28.911716', 0),
    ('f6a1d200-2bcc-49b6-b91c-4cb69c609b40', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', N'member', '2026-10-17T21:32:28.959073', 0);
    PRINT 'GroupMembers: 10 rows';

    INSERT INTO splitshare.[Expenses] ([Id], [GroupId], [Title], [Description], [AmountCents], [PayerId], [SplitType], [Status], [CreatedBy], [CreatedAt], [UpdatedAt], [Version], [DeletedAt], [Category], [SpentAt], [TaxCents], [TipCents], [FeeCents], [OrigCurrency], [OrigAmountCents], [FxRate]) VALUES
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Groceries (week 1)', N'Weekly grocery run at the corner market', 12000, 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 0, 0, 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', '2026-10-17T21:32:29.160420', '2026-10-17T21:32:29.160420', 1, NULL, N'food', '2026-09-20T18:00:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Dinner at Pho spot', N'Group dinner after class', 3850, '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 0, 0, '3d27fb27-1368-4625-8f5c-222e6ff0f6da', '2026-10-17T21:32:29.756868', '2026-10-17T21:32:29.756868', 1, NULL, N'food', '2026-09-22T20:30:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Gas + parking', N'Road-trip fuel and downtown parking', 6000, '9e9f407c-0466-44ab-926c-05d29b202350', 0, 0, '9e9f407c-0466-44ab-926c-05d29b202350', '2026-10-17T21:32:30.287614', '2026-10-17T21:32:30.287614', 1, NULL, N'transport', '2026-09-24T09:00:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Movie night tickets', N'Cinema tickets for the group', 2500, 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 0, 0, 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', '2026-10-17T21:32:30.823691', '2026-10-17T21:32:30.823691', 1, NULL, N'activity', '2026-09-26T21:00:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Coffee run (office)', N'Monday coffee run for the team', 9990, 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 0, 0, 'fbea964c-932d-43d0-be7c-5e8f42d7f526', '2026-10-17T21:32:31.367649', '2026-10-17T21:32:31.367650', 1, NULL, N'food', '2026-09-28T08:30:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Airbnb deposit (Oct trip)', N'Cabin booking deposit for the October trip', 15000, 'cada6148-55f7-43c2-b828-827b0d53a844', 0, 0, 'cada6148-55f7-43c2-b828-827b0d53a844', '2026-10-17T21:32:31.913762', '2026-10-17T21:32:31.913762', 1, NULL, N'stay', '2026-10-01T14:00:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Pharmacy run', N'First-aid kit and basics', 7320, '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 0, 0, '4a5a6ccd-2fc6-466c-b389-172047b40e9c', '2026-10-17T21:32:32.470571', '2026-10-17T21:32:32.470571', 1, NULL, N'health', '2026-10-03T17:45:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Uber to airport', N'Early-morning ride to the airport', 4200, 'af93d2bf-6065-4f11-9f82-93414ffc5900', 0, 0, 'af93d2bf-6065-4f11-9f82-93414ffc5900', '2026-10-17T21:32:33.021094', '2026-10-17T21:32:33.021094', 1, NULL, N'transport', '2026-10-06T05:15:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Wifi + utilities', N'October wifi and utilities split', 11000, '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 0, 0, '6f9613c6-877f-4050-af44-6e1bc6fd3c43', '2026-10-17T21:32:33.564116', '2026-10-17T21:32:33.564116', 1, NULL, N'bills', '2026-10-10T12:00:00.000000', 0, 0, 0, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'f6a1d200-2bcc-49b6-b91c-4cb69c609b40', N'Birthday cake + drinks', N'Birthday celebration supplies', 8500, '025a9a78-98d8-4261-a3d1-9550e710fe23', 0, 0, '025a9a78-98d8-4261-a3d1-9550e710fe23', '2026-10-17T21:32:34.113663', '2026-10-17T21:32:34.113663', 1, NULL, N'shopping', '2026-10-15T19:00:00.000000', 0, 0, 0, NULL, NULL, NULL);
    PRINT 'Expenses: 10 rows';

    INSERT INTO splitshare.[ExpenseSplits] ([ExpenseId], [UserId], [ShareCents], [ExactCents], [Percent], [Shares]) VALUES
    ('07a53839-e0ed-4437-8898-221fa80dccc5', '025a9a78-98d8-4261-a3d1-9550e710fe23', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', '9e9f407c-0466-44ab-926c-05d29b202350', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'cada6148-55f7-43c2-b828-827b0d53a844', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 732, NULL, NULL, NULL),
    ('07a53839-e0ed-4437-8898-221fa80dccc5', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 732, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', '025a9a78-98d8-4261-a3d1-9550e710fe23', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', '9e9f407c-0466-44ab-926c-05d29b202350', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'cada6148-55f7-43c2-b828-827b0d53a844', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 600, NULL, NULL, NULL),
    ('16f672be-4efb-4ba7-8618-67417eae45f9', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 600, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', '025a9a78-98d8-4261-a3d1-9550e710fe23', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', '9e9f407c-0466-44ab-926c-05d29b202350', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'cada6148-55f7-43c2-b828-827b0d53a844', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 999, NULL, NULL, NULL),
    ('19857ba2-259d-4294-abaa-297d5ea5857c', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 999, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', '025a9a78-98d8-4261-a3d1-9550e710fe23', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', '9e9f407c-0466-44ab-926c-05d29b202350', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'cada6148-55f7-43c2-b828-827b0d53a844', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 850, NULL, NULL, NULL),
    ('3eecda1c-9d0d-4f29-881a-a3aebc36729b', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 850, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', '025a9a78-98d8-4261-a3d1-9550e710fe23', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', '9e9f407c-0466-44ab-926c-05d29b202350', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'cada6148-55f7-43c2-b828-827b0d53a844', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 1100, NULL, NULL, NULL),
    ('40d7148a-ff05-4eb0-8c34-0bf7e727f847', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 1100, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', '025a9a78-98d8-4261-a3d1-9550e710fe23', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', '9e9f407c-0466-44ab-926c-05d29b202350', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'cada6148-55f7-43c2-b828-827b0d53a844', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 250, NULL, NULL, NULL),
    ('442c408b-ea7b-47a8-9696-26a750b5af1e', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 250, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', '025a9a78-98d8-4261-a3d1-9550e710fe23', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', '9e9f407c-0466-44ab-926c-05d29b202350', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'cada6148-55f7-43c2-b828-827b0d53a844', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 1200, NULL, NULL, NULL),
    ('73903b73-a36e-4e22-8785-a282966b5c10', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 1200, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', '025a9a78-98d8-4261-a3d1-9550e710fe23', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', '9e9f407c-0466-44ab-926c-05d29b202350', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'cada6148-55f7-43c2-b828-827b0d53a844', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 420, NULL, NULL, NULL),
    ('a22fd0eb-06e7-450f-a19d-65062aa69ca1', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 420, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', '025a9a78-98d8-4261-a3d1-9550e710fe23', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', '9e9f407c-0466-44ab-926c-05d29b202350', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'cada6148-55f7-43c2-b828-827b0d53a844', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 1500, NULL, NULL, NULL),
    ('b3aa1c84-eac0-40f2-9178-689ea34bab1c', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 1500, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', '025a9a78-98d8-4261-a3d1-9550e710fe23', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', '3d27fb27-1368-4625-8f5c-222e6ff0f6da', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', '4a5a6ccd-2fc6-466c-b389-172047b40e9c', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', '6f9613c6-877f-4050-af44-6e1bc6fd3c43', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', '9e9f407c-0466-44ab-926c-05d29b202350', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'af93d2bf-6065-4f11-9f82-93414ffc5900', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'cada6148-55f7-43c2-b828-827b0d53a844', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'cbf93329-5655-47d1-9eb0-5ed0015fb52d', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'ebd66cb3-403a-4a35-96e4-fd6ab224f18b', 385, NULL, NULL, NULL),
    ('cd7a8f4c-6bd2-41cb-8860-387759c86df8', 'fbea964c-932d-43d0-be7c-5e8f42d7f526', 385, NULL, NULL, NULL);
    PRINT 'ExpenseSplits: 100 rows';

    COMMIT;
END;

-- Optional: mark the sample accounts' emails as verified so no verification
-- banner shows in the UI:
-- UPDATE splitshare.[Users] SET [EmailVerifiedAt] = GETUTCDATE()
-- WHERE [EmailVerifiedAt] IS NULL AND [Email] IN (N'khanhnguyen@gmail.com', N'mytruong@gmail.com', N'duytruong@gmail.com', N'sendoan@gmail.com', N'khanhkevin@gmail.com', N'nhatle@gmail.com', N'thinh@gmail.com', N'tuan@gmail.com', N'tramd@gmail.com', N'uyen@gmail.com');
