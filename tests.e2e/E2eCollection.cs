namespace SplitShare.E2E;

/// <summary>
/// One shared API host for the whole E2E run: every test class joins this
/// collection, so the host (and the dropped/recreated test database) is built
/// once and disposed after the last test.
/// </summary>
[CollectionDefinition(Name)]
public sealed class E2eCollection : ICollectionFixture<E2eApiFactory>
{
    public const string Name = "e2e";
}
