import graphene


class AccountDelete(graphene.Mutation):
    class Arguments:
        token = graphene.String(required=True)

    ok = graphene.Boolean()

    @classmethod
    def mutate(cls, root, info, token):
        user = info.context.user
        if not user.is_authenticated:
            raise PermissionError("Sign in to delete your account")
        user.delete()
        return AccountDelete(ok=True)


class StaffDeleteCustomer(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()

    @classmethod
    def mutate(cls, root, info, id):
        staff = info.context.user
        assert staff.is_staff
        Customer.objects.get(pk=id).delete()
        return StaffDeleteCustomer(ok=True)
