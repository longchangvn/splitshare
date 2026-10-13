namespace SplitShare.Api.Common;

// Standard error envelope per spec §9: {code, message, fields?}
public sealed record ErrorResponse(string Code, string Message, Dictionary<string, string[]>? Fields = null);

public static class ErrorCodes
{
    public const string Validation = "VALIDATION";
    public const string Unauth = "UNAUTH";
    public const string Forbidden = "FORBIDDEN";
    public const string NotFound = "NOT_FOUND";
    public const string Conflict = "CONFLICT";
    public const string StaleVersion = "STALE_VERSION";
    public const string Overpayment = "OVERPAYMENT";
    public const string HasOpenBalance = "HAS_OPEN_BALANCE";
    public const string ExpenseLocked = "EXPENSE_LOCKED";
    public const string GroupFull = "GROUP_FULL";
    public const string AlreadySettled = "ALREADY_SETTLED";
    public const string InviteRotated = "INVITE_ROTATED";
    public const string InvolvesRemovedMember = "INVOLVES_REMOVED_MEMBER";
}

public static class ApiResults
{
    public static IResult Error(string code, string message, int statusCode, Dictionary<string, string[]>? fields = null)
        => Results.Json(new ErrorResponse(code, message, fields), statusCode: statusCode);

    public static IResult NotFound(string message = "Not found.")
        => Error(ErrorCodes.NotFound, message, StatusCodes.Status404NotFound);

    public static IResult Validation(string message, Dictionary<string, string[]>? fields = null)
        => Error(ErrorCodes.Validation, message, StatusCodes.Status422UnprocessableEntity, fields);

    public static IResult Conflict(string code, string message)
        => Error(code, message, StatusCodes.Status409Conflict);
}
