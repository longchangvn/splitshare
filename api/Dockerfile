# .NET 10 multi-stage. Build context is the REPO ROOT (see docker-compose.yml)
# so the api + servicedefaults ProjectReference resolves inside the image.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY api/*.csproj ./api/
COPY servicedefaults/*.csproj ./servicedefaults/
RUN dotnet restore ./api/SplitShare.Api.csproj
COPY api/ ./api/
COPY servicedefaults/ ./servicedefaults/
WORKDIR /src/api
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "SplitShare.Api.dll"]
